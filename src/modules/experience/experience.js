import { Router } from 'express';
import { z } from 'zod';
import { appStore, getPesquisaById, getRespostaByPesquisaPergunta } from '../../core/memory.js';
import { calculateAverage } from '../../core/metrics.js';
import { AppError } from '../../core/errors.js';
import { asyncHandler, databaseConfigured, query } from '../../runtime/database.js';
import { randomBytes } from 'node:crypto';

const router = Router();

const createPesquisaSchema = z.object({
  setor_id: z.number().int().positive(),
  anonimo: z.boolean().optional().default(false),
  consentimento: z.boolean().optional().default(false),
});

const respostaSchema = z.object({
  valor: z.number().int().min(0).max(10).optional(),
  texto: z.string().optional(),
  opcao_id: z.number().int().optional(),
  pergunta_id: z.number().int().positive(),
});

const pacienteSchema = z.object({
  telefone: z.string().min(8).max(30),
  consentimento: z.literal(true),
});

const sortQuestions = (questions) => questions.sort((a, b) => {
  if (a.geral && !b.geral) return -1;
  if (!a.geral && b.geral) return 1;
  return a.ordem - b.ordem;
});

const validateAnswer = (question, answer, optionIsValid = true) => {
  if (answer.pergunta_id !== undefined && Number(answer.pergunta_id) !== Number(question.id)) {
    throw new AppError('A pergunta do corpo não corresponde à rota', 400, 'QUESTION_MISMATCH');
  }
  if (question.tipo === 'nps' && (answer.valor === undefined || answer.valor < 0 || answer.valor > 10)) {
    throw new AppError('Informe uma nota NPS de 0 a 10', 400, 'INVALID_ANSWER');
  }
  if (question.tipo === 'rostinho' && (answer.valor === undefined || answer.valor < 1 || answer.valor > 5)) {
    throw new AppError('Informe uma avaliação de 1 a 5', 400, 'INVALID_ANSWER');
  }
  if (question.tipo === 'texto' && !answer.texto?.trim()) {
    throw new AppError('Informe uma resposta de texto', 400, 'INVALID_ANSWER');
  }
  if (question.tipo === 'multipla' && (!answer.opcao_id || !optionIsValid)) {
    throw new AppError('Selecione uma opção válida para esta pergunta', 400, 'INVALID_ANSWER');
  }
};

const currentShift = () => {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date()));
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
};

const saoPauloDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const publicSector = (sector) => ({
  ...sector,
  url: `/pesquisa/${sector.slug}`,
  qrcode: `/pesquisa/${sector.slug}`,
});

const requireSurveyToken = (allowCompleted = false) => asyncHandler(async (req, _res, next) => {
  const token = req.get('x-survey-token');
  if (!token) throw new AppError('Token da pesquisa ausente', 401, 'SURVEY_TOKEN_MISSING');

  if (databaseConfigured) {
    const result = await query(
      `SELECT * FROM survey WHERE id = $1 AND token = $2
       AND ($3::boolean = TRUE OR status = 'em_andamento')`,
      [Number(req.params.id), token, allowCompleted],
    );
    if (!result.rowCount) throw new AppError('Token inválido ou pesquisa encerrada', 403, 'INVALID_SURVEY_TOKEN');
    req.pesquisa = result.rows[0];
    return next();
  }

  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa || pesquisa.token !== token || (!allowCompleted && pesquisa.status !== 'em_andamento')) {
    throw new AppError('Token inválido ou pesquisa encerrada', 403, 'INVALID_SURVEY_TOKEN');
  }
  req.pesquisa = pesquisa;
  return next();
});

router.get('/setores', asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM sector WHERE ativo = TRUE ORDER BY id');
    return res.json(result.rows.map(publicSector));
  }
  res.json(appStore.setores.filter((setor) => setor.ativo).map(publicSector));
}));

router.get('/privacidade', asyncHandler(async (_req, res) => {
  let retentionDays = 365;
  if (databaseConfigured) {
    const result = await query(
      `SELECT c.valor->>'valor' AS valor FROM hospital_setting c
      WHERE c.hospital_id = (SELECT id FROM hospital ORDER BY id LIMIT 1)
         AND c.chave = 'retencao_dias' LIMIT 1`,
    );
    retentionDays = Number(result.rows[0]?.valor ?? retentionDays);
  } else {
    retentionDays = Number(appStore.configuracoes.find((item) => item.chave === 'retencao_dias')?.valor?.valor ?? retentionDays);
  }
  res.json({
    controlador: 'Fundação Hospitalar Dr. Oswaldo Diesel',
    dados_da_pesquisa: 'As respostas são registradas sem nome ou prontuário.',
    contato_ouvidoria: 'O telefone é opcional e usado somente quando solicitado retorno da Ouvidoria, mediante consentimento.',
    acesso_ao_contato: 'Restrito à equipe autorizada da Ouvidoria.',
    retencao_dias: retentionDays,
    direitos: 'O titular pode solicitar acesso, correção ou exclusão dos dados pessoais pelos canais oficiais do hospital.',
    lei_url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
  });
}));

router.get('/setores/:slug', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM sector WHERE slug = $1 AND ativo = TRUE', [req.params.slug]);
    if (!result.rowCount) throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
    return res.json(publicSector(result.rows[0]));
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  res.json(publicSector(setor));
}));

router.get('/setores/:slug/fluxo', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT s.*, p.id AS pergunta_id, p.texto, p.tipo, p.geral, p.ordem,
              p.obrigatoria, p.ativo AS pergunta_ativa,
              COALESCE(json_agg(json_build_object(
                'id', o.id, 'pergunta_id', o.pergunta_id, 'valor', o.valor,
                'rotulo', o.rotulo, 'emoji', o.emoji
              ) ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM sector s
       LEFT JOIN question p ON p.ativo = TRUE AND (p.setor_id = s.id OR p.geral = TRUE)
       LEFT JOIN answer_option o ON o.pergunta_id = p.id
       WHERE s.slug = $1 AND s.ativo = TRUE
       GROUP BY s.id, p.id
      ORDER BY p.geral DESC, p.ordem`,
      [req.params.slug],
    );
    if (!result.rowCount) throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
    const setor = publicSector(Object.fromEntries(Object.entries(result.rows[0]).filter(([key]) => ![
      'pergunta_id', 'texto', 'tipo', 'geral', 'ordem', 'obrigatoria', 'pergunta_ativa', 'opcoes',
    ].includes(key))));
    const fluxo = sortQuestions(result.rows.filter((row) => row.pergunta_id !== null)).map((row, index) => ({
      id: row.pergunta_id,
      texto: row.texto,
      tipo: row.tipo,
      geral: row.geral,
      ordem: row.ordem,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
      opcoes: row.opcoes,
    }));
    return res.json({ setor, fluxo });
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = sortQuestions(appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral))
  )
    .map((pergunta, index) => ({
      id: pergunta.id,
      texto: pergunta.texto,
      tipo: pergunta.tipo,
      geral: pergunta.geral,
      ordem: pergunta.ordem,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
      opcoes: appStore.opcoesResposta.filter((opcao) => opcao.pergunta_id === pergunta.id),
    }));

  res.json({ setor: publicSector(setor), fluxo });
}));

router.get('/setores/:slug/perguntas/:n', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT p.*, COALESCE(json_agg(json_build_object(
        'id', o.id, 'pergunta_id', o.pergunta_id, 'valor', o.valor,
        'rotulo', o.rotulo, 'emoji', o.emoji
      ) ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM sector s
       JOIN question p ON p.ativo = TRUE AND (p.setor_id = s.id OR p.geral = TRUE)
       LEFT JOIN answer_option o ON o.pergunta_id = p.id
       WHERE s.slug = $1 AND s.ativo = TRUE
       GROUP BY s.id, p.id
      ORDER BY p.geral DESC, p.ordem`,
      [req.params.slug],
    );
    if (!result.rowCount) throw new AppError('Setor ou pergunta não encontrado', 404, 'PERGUNTA_NOT_FOUND');
    const index = Number(req.params.n) - 1;
    const row = result.rows[index];
    if (!row) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
    const { opcoes, ...pergunta } = row;
    return res.json({ pergunta, numero: index + 1, total: result.rowCount, opcoes });
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = sortQuestions(appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral))
  );

  const index = Number(req.params.n) - 1;
  const pergunta = fluxo[index];
  if (!pergunta) {
    throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  }

  res.json({
    pergunta,
    numero: index + 1,
    total: fluxo.length,
    opcoes: appStore.opcoesResposta.filter((opcao) => opcao.pergunta_id === pergunta.id),
  });
}));

router.post('/pesquisas', asyncHandler(async (req, res) => {
  const payload = createPesquisaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const sectorResult = await query('SELECT id, slug FROM sector WHERE id = $1 AND ativo = TRUE', [payload.data.setor_id]);
    const setorDb = sectorResult.rows[0];
    if (!setorDb) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });

    const token = randomBytes(24).toString('hex');
    const result = await query(
      `INSERT INTO survey (setor_id, equipe_id, turno, anonimo, consentimento, status, token)
       SELECT $1, equipe.id, turno_atual.valor, $2, $3, 'em_andamento', $4
       FROM (
         SELECT CASE
           WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < 12 THEN 'manha'
           WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < 18 THEN 'tarde'
           ELSE 'noite'
         END AS valor
       ) AS turno_atual
       LEFT JOIN LATERAL (
         SELECT id FROM care_team
         WHERE setor_id = $1 AND data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           AND turno = turno_atual.valor
         ORDER BY id DESC LIMIT 1
       ) AS equipe ON TRUE
       RETURNING id, token`,
      [setorDb.id, payload.data.anonimo, payload.data.consentimento, token],
    );
    return res.status(201).json({ pesquisa_id: result.rows[0].id, token: result.rows[0].token, setor: setorDb.slug });
  }

  const setor = appStore.setores.find((item) => item.id === payload.data.setor_id && item.ativo);
  if (!setor) {
    return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
  }

  const pesquisa = {
    id: appStore.pesquisas.length + 1,
    setor_id: setor.id,
    paciente_id: null,
    data_hora: new Date().toISOString(),
    turno: currentShift(),
    equipe_id: appStore.equipes.find((team) => team.setor_id === setor.id
      && team.data === saoPauloDate() && team.turno === currentShift())?.id ?? null,
    anonimo: payload.data.anonimo,
    consentimento: payload.data.consentimento,
    media_parcial: null,
    nps_nota: null,
    status: 'em_andamento',
    encaminhado_ouvidoria: false,
    ultima_atividade: new Date().toISOString(),
    token: randomBytes(32).toString('hex'),
  };

  appStore.pesquisas.push(pesquisa);
  return res.status(201).json({ pesquisa_id: pesquisa.id, token: pesquisa.token, setor: setor.slug });
}));

router.put('/pesquisas/:id/respostas/:perguntaId', requireSurveyToken(), asyncHandler(async (req, res) => {
  const payload = respostaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const pesquisaDb = req.pesquisa;

    const questionResult = await query(
      `SELECT * FROM question
       WHERE id = $1 AND ativo = TRUE AND (setor_id = $2 OR geral = TRUE)`,
      [Number(req.params.perguntaId), pesquisaDb.setor_id],
    );
    const perguntaDb = questionResult.rows[0];
    if (!perguntaDb) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');

    let optionIsValid = true;
    if (payload.data.opcao_id !== undefined) {
      const option = await query(
        'SELECT id FROM answer_option WHERE id = $1 AND pergunta_id = $2',
        [payload.data.opcao_id, perguntaDb.id],
      );
      optionIsValid = option.rowCount > 0;
    }
    validateAnswer(perguntaDb, payload.data, optionIsValid);

    await query(
      `INSERT INTO answer (pesquisa_id, pergunta_id, opcao_id, valor, texto)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pesquisa_id, pergunta_id)
       DO UPDATE SET opcao_id = EXCLUDED.opcao_id, valor = EXCLUDED.valor, texto = EXCLUDED.texto`,
      [pesquisaDb.id, perguntaDb.id, payload.data.opcao_id ?? null, payload.data.valor ?? null, payload.data.texto ?? null],
    );

    const metrics = await query(
      `SELECT ROUND(AVG(r.valor)::numeric, 1) AS media
       FROM answer r
       JOIN question p ON p.id = r.pergunta_id
       WHERE r.pesquisa_id = $1 AND p.geral = FALSE AND r.valor BETWEEN 1 AND 5`,
      [pesquisaDb.id],
    );
    const mediaParcial = metrics.rows[0].media === null ? null : Number(metrics.rows[0].media);
    const npsNota = perguntaDb.geral && perguntaDb.tipo === 'nps'
      ? payload.data.valor ?? null
      : pesquisaDb.nps_nota;
    await query(
      `UPDATE survey
       SET media_parcial = $2, nps_nota = $3, ultima_atividade = NOW()
       WHERE id = $1`,
      [pesquisaDb.id, mediaParcial, npsNota],
    );

    const next = await query(
      `SELECT s.slug, p.id, p.geral, p.ordem
       FROM sector s
       LEFT JOIN question p ON p.ativo = TRUE AND (p.setor_id = s.id OR p.geral = TRUE)
       WHERE s.id = $1
       ORDER BY p.geral DESC, p.ordem`,
      [pesquisaDb.setor_id],
    );
    const questions = next.rows.filter((row) => row.id !== null);
    const currentIndex = questions.findIndex((row) => row.id === perguntaDb.id);
    const nextQuestion = questions[currentIndex + 1]
      ? `/pesquisa/${next.rows[0].slug}/pergunta/${currentIndex + 2}`
      : null;
    return res.json({
      ok: true,
      proximaPergunta: nextQuestion,
      mediaParcial,
      ultima: nextQuestion === null,
    });
  }

  const pesquisa = req.pesquisa;

  const pergunta = appStore.perguntas.find((item) => item.id === Number(req.params.perguntaId)
    && item.ativo && (item.setor_id === pesquisa.setor_id || item.geral));
  if (!pergunta) {
    throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  }
  const optionIsValid = payload.data.opcao_id === undefined
    || appStore.opcoesResposta.some((option) => option.id === payload.data.opcao_id && option.pergunta_id === pergunta.id);
  validateAnswer(pergunta, payload.data, optionIsValid);

  const existing = getRespostaByPesquisaPergunta(pesquisa.id, pergunta.id);
  const resposta = {
    id: existing?.id ?? appStore.respostas.length + 1,
    pesquisa_id: pesquisa.id,
    pergunta_id: pergunta.id,
    opcao_id: payload.data.opcao_id ?? null,
    valor: payload.data.valor ?? null,
    texto: payload.data.texto ?? null,
  };

  if (existing) {
    const index = appStore.respostas.findIndex((item) => item.id === existing.id);
    appStore.respostas[index] = resposta;
  } else {
    appStore.respostas.push(resposta);
  }

  const respostasDoSetor = appStore.respostas.filter((item) => item.pesquisa_id === pesquisa.id && item.valor !== null && item.valor >= 1 && item.valor <= 5);
  pesquisa.media_parcial = calculateAverage(respostasDoSetor.map((item) => item.valor)) ?? null;

  if (pergunta.geral && pergunta.tipo === 'nps') {
    pesquisa.nps_nota = payload.data.valor ?? null;
  }

  pesquisa.ultima_atividade = new Date().toISOString();

  const fluxo = sortQuestions(appStore.perguntas.filter((item) => item.ativo && (item.setor_id === pesquisa.setor_id || item.geral)));
  const currentIndex = fluxo.findIndex((item) => item.id === pergunta.id);
  const slug = appStore.setores.find((setor) => setor.id === pesquisa.setor_id)?.slug ?? 'setor';
  const proximaPergunta = fluxo[currentIndex + 1] ? `/pesquisa/${slug}/pergunta/${currentIndex + 2}` : null;

  return res.json({
    ok: true,
    proximaPergunta,
    mediaParcial: pesquisa.media_parcial,
    ultima: proximaPergunta === null,
  });
}));

router.post('/pesquisas/:id/finalizar', requireSurveyToken(), asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const pesquisaDb = req.pesquisa;
    if (pesquisaDb.nps_nota === null) {
      return res.status(422).json({ erro: 'NPS obrigatório antes de finalizar', codigo: 'NPS_REQUIRED' });
    }

    const config = await query(
      `SELECT chave, valor FROM hospital_setting WHERE hospital_id = (
         SELECT hospital_id FROM sector WHERE id = $1
       ) AND chave IN ('limiar_nps_baixo', 'limiar_media_baixa')`,
      [pesquisaDb.setor_id],
    );
    const values = Object.fromEntries(config.rows.map(({ chave, valor }) => [chave, valor?.valor]));
    const limiarNps = Number(values.limiar_nps_baixo ?? 6);
    const limiarMedia = Number(values.limiar_media_baixa ?? 2);
    const encaminhar = pesquisaDb.nps_nota <= limiarNps
      || (pesquisaDb.media_parcial !== null && Number(pesquisaDb.media_parcial) <= limiarMedia);
    await query(
      `UPDATE survey
       SET status = 'concluida', encaminhado_ouvidoria = $2, ultima_atividade = NOW()
       WHERE id = $1`,
      [pesquisaDb.id, encaminhar],
    );
    return res.json({
      destino: encaminhar ? 'ouvidoria' : 'agradecimento',
      motivo: encaminhar ? 'nps_baixo_ou_media_baixa' : 'satisfacao_aceitavel',
    });
  }

  const pesquisa = req.pesquisa;

  if (pesquisa.nps_nota === null || pesquisa.nps_nota === undefined) {
    return res.status(422).json({ erro: 'NPS obrigatório antes de finalizar', codigo: 'NPS_REQUIRED' });
  }

  pesquisa.status = 'concluida';
  pesquisa.ultima_atividade = new Date().toISOString();

  const limiarNps = appStore.configuracoes.find((item) => item.chave === 'limiar_nps_baixo')?.valor?.valor ?? 6;
  const limiarMedia = appStore.configuracoes.find((item) => item.chave === 'limiar_media_baixa')?.valor?.valor ?? 2;
  const mediaBaixa = pesquisa.media_parcial !== null && pesquisa.media_parcial <= Number(limiarMedia);
  const encaminharOuvidoria = pesquisa.nps_nota <= Number(limiarNps) || mediaBaixa;
  pesquisa.encaminhado_ouvidoria = encaminharOuvidoria;

  return res.json({
    destino: encaminharOuvidoria ? 'ouvidoria' : 'agradecimento',
    motivo: encaminharOuvidoria ? 'nps_baixo_ou_media_baixa' : 'satisfacao_aceitavel',
  });
}));

router.post('/pesquisas/:id/paciente', requireSurveyToken(), asyncHandler(async (req, res) => {
  const payload = pacienteSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const survey = req.pesquisa;
    if (survey.anonimo || !payload.data.consentimento) {
      return res.status(400).json({ erro: 'Somente com consentimento explícito e não anônimo', codigo: 'CONSENTIMENTO_INVALIDO' });
    }
    const patient = await query(
      `INSERT INTO patient (telefone, consentimento)
       VALUES ($1, TRUE)
       RETURNING id`,
      [payload.data.telefone],
    );
    await query('UPDATE survey SET paciente_id = $2 WHERE id = $1', [survey.id, patient.rows[0].id]);
    return res.status(201).json({ ok: true });
  }

  const pesquisa = req.pesquisa;
  if (pesquisa.anonimo || !payload.data.consentimento) {
    return res.status(400).json({ erro: 'Somente com consentimento explícito e não anônimo', codigo: 'CONSENTIMENTO_INVALIDO' });
  }

  const paciente = {
    id: appStore.pacientes.length + 1,
    telefone: payload.data.telefone,
    consentimento: true,
    criado_em: new Date().toISOString(),
  };
  appStore.pacientes.push(paciente);
  pesquisa.paciente_id = paciente.id;

  return res.status(201).json({ ok: true });
}));

router.post('/pesquisas/:id/manifestacoes', requireSurveyToken(true), asyncHandler(async (req, res) => {
  const schema = z.object({
    tipo: z.enum(['elogio', 'reclamacao', 'sugestao']),
    descricao: z.string().min(5),
    anonimo: z.boolean().optional().default(false),
    canal_contato: z.string().optional(),
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const survey = req.pesquisa;
    const inserted = await query(
      `INSERT INTO feedback (pesquisa_id, tipo, descricao, status, anonimo, origem, media_origem, canal_contato)
       VALUES ($1, $2, $3, 'aberta', $4, 'pesquisa', $5, $6)
       RETURNING *`,
      [
        survey.id,
        payload.data.tipo,
        payload.data.descricao,
        payload.data.anonimo,
        survey.media_parcial,
        payload.data.anonimo ? null : payload.data.canal_contato ?? null,
      ],
    );
    return res.status(201).json(inserted.rows[0]);
  }

  const pesquisa = req.pesquisa;

  const manifestacao = {
    id: appStore.manifestacoes.length + 1,
    pesquisa_id: pesquisa.id,
    tipo: payload.data.tipo,
    descricao: payload.data.descricao,
    status: 'aberta',
    data: new Date().toISOString(),
    anonimo: payload.data.anonimo,
    origem: 'pesquisa',
    media_origem: pesquisa.media_parcial,
    motivo_encaminhamento: null,
    canal_contato: payload.data.anonimo ? null : payload.data.canal_contato ?? null,
    parecer_interno: null,
  };

  appStore.manifestacoes.push(manifestacao);
  return res.status(201).json(manifestacao);
}));

export default router;
