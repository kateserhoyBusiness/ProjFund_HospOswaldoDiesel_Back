import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../core/memory.js';
import { requireAuth, requirePermission } from '../auth/auth.js';
import { asyncHandler, databaseConfigured, query } from '../../runtime/database.js';
import { AppError } from '../../core/errors.js';

const router = Router();

const setorSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).optional(),
  ativo: z.boolean().optional().default(true),
});

const optionsSchema = z.array(z.object({
  valor: z.number().int().min(1).max(5),
  rotulo: z.string().trim().min(1).max(120),
  emoji: z.string().max(20).optional().nullable(),
})).max(10).refine((options) => new Set(options.map((option) => option.valor)).size === options.length);

const questionSchema = z.object({
  setor_id: z.number().int().positive(),
  texto: z.string().trim().min(5).max(500),
  tipo: z.enum(['rostinho', 'texto', 'multipla']),
  ordem: z.number().int().positive().optional().default(1),
  rota_id: z.number().int().positive().optional().nullable(),
  opcoes: optionsSchema.optional().default([]),
}).superRefine((question, context) => {
  if (question.tipo === 'multipla' && question.opcoes.length < 2) {
    context.addIssue({ code: 'custom', path: ['opcoes'], message: 'Adicione ao menos duas opções.' });
  }
});

const teamSchema = z.object({
  setor_id: z.number().int().positive(),
  nome: z.string().trim().min(2).max(150),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.enum(['manha', 'tarde', 'noite']),
});

const questionUpdateSchema = z.object({
  texto: z.string().trim().min(5).max(500).optional(),
  tipo: z.enum(['rostinho', 'texto', 'multipla']).optional(),
  ordem: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  opcoes: optionsSchema.optional(),
});

const requireQuestionManager = (req, _res, next) => {
  const permissions = new Set(req.user?.permissoes ?? []);
  if (permissions.has('super_admin') || permissions.has('admin_setor')) return next();
  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

const canManageSector = (user, sectorId) =>
  user?.permissoes?.includes('super_admin') || Number(user?.setor_id) === Number(sectorId);

const defaultFaceOptions = [
  { valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
  { valor: 2, rotulo: 'Ruim', emoji: '🙁' },
  { valor: 3, rotulo: 'Regular', emoji: '😐' },
  { valor: 4, rotulo: 'Bom', emoji: '🙂' },
  { valor: 5, rotulo: 'Muito bom', emoji: '😍' },
];

router.get('/admin/setores', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM sector ORDER BY id');
    return res.json(result.rows);
  }
  res.json(appStore.setores);
}));

router.post('/admin/setores', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const payload = setorSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const slug = payload.data.slug ?? payload.data.nome.toLowerCase().replace(/\s+/g, '-');
  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO sector (hospital_id, nome, slug, url, qrcode, ativo)
       VALUES (1, $1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.data.nome, slug, `/pesquisa/${slug}`, `/pesquisa/${slug}`, payload.data.ativo],
    );
    return res.status(201).json(result.rows[0]);
  }

  const setor = {
    id: appStore.setores.length + 1,
    hospital_id: 1,
    nome: payload.data.nome,
    slug,
    url: `/pesquisa/${slug}`,
    qrcode: `/pesquisa/${slug}`,
    ativo: payload.data.ativo,
  };

  appStore.setores.push(setor);
  return res.status(201).json(setor);
}));

router.get('/admin/perguntas', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const setorId = req.query.setor_id ? Number(req.query.setor_id) : req.user.setor_id;
  if (!setorId || !canManageSector(req.user, setorId)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }

  if (databaseConfigured) {
    const result = await query(
      `SELECT p.*, COALESCE(json_agg(json_build_object(
        'id', o.id, 'valor', o.valor, 'rotulo', o.rotulo, 'emoji', o.emoji
      ) ORDER BY o.valor) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM question p LEFT JOIN answer_option o ON o.pergunta_id = p.id
       WHERE p.setor_id = $1 GROUP BY p.id ORDER BY p.ordem, p.id`,
      [setorId],
    );
    return res.json(result.rows);
  }

  const questions = appStore.perguntas.filter((item) => item.setor_id === setorId).map((question) => ({
    ...question,
    opcoes: appStore.opcoesResposta.filter((option) => option.pergunta_id === question.id),
  }));
  return res.json(questions);
}));

router.post('/admin/perguntas', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const payload = questionSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  if (!canManageSector(req.user, payload.data.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }

  const options = payload.data.opcoes.length
    ? payload.data.opcoes
    : payload.data.tipo === 'rostinho' ? defaultFaceOptions : [];

  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO question (hospital_id, setor_id, rota_id, texto, tipo, geral, ordem, obrigatoria)
       SELECT hospital_id, id, $2, $3, $4, FALSE, $5, FALSE FROM sector WHERE id = $1
       RETURNING *`,
      [payload.data.setor_id, payload.data.rota_id ?? null, payload.data.texto, payload.data.tipo, payload.data.ordem],
    );
    const question = result.rows[0];
    if (!question) throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
    for (const option of options) {
      await query(
        `INSERT INTO answer_option (pergunta_id, valor, rotulo, emoji)
         VALUES ($1, $2, $3, $4)`,
        [question.id, option.valor, option.rotulo, option.emoji ?? null],
      );
    }
    return res.status(201).json({ ...question, opcoes: options });
  }

  const question = {
    id: Math.max(0, ...appStore.perguntas.map((item) => item.id)) + 1,
    hospital_id: 1,
    setor_id: payload.data.setor_id,
    rota_id: payload.data.rota_id ?? null,
    texto: payload.data.texto,
    tipo: payload.data.tipo,
    geral: false,
    ordem: payload.data.ordem,
    obrigatoria: false,
    ativo: true,
  };
  appStore.perguntas.push(question);
  for (const option of options) {
    appStore.opcoesResposta.push({ id: appStore.opcoesResposta.length + 1, pergunta_id: question.id, ...option });
  }
  return res.status(201).json({ ...question, opcoes: options });
}));

router.patch('/admin/perguntas/:id', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const payload = questionUpdateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  const questionId = Number(req.params.id);

  if (databaseConfigured) {
    const current = await query('SELECT * FROM question WHERE id = $1 AND geral = FALSE', [questionId]);
    const question = current.rows[0];
    if (!question) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
    if (!canManageSector(req.user, question.setor_id)) {
      throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
    }
    const result = await query(
      `UPDATE question SET texto = COALESCE($2, texto), tipo = COALESCE($3, tipo),
       ordem = COALESCE($4, ordem), ativo = COALESCE($5, ativo) WHERE id = $1 RETURNING *`,
      [questionId, payload.data.texto ?? null, payload.data.tipo ?? null, payload.data.ordem ?? null, payload.data.ativo ?? null],
    );
    if (payload.data.opcoes !== undefined) {
      await query('DELETE FROM answer_option WHERE pergunta_id = $1', [questionId]);
      for (const option of payload.data.opcoes) {
        await query(
          `INSERT INTO answer_option (pergunta_id, valor, rotulo, emoji)
           VALUES ($1, $2, $3, $4)`,
          [questionId, option.valor, option.rotulo, option.emoji ?? null],
        );
      }
    }
    const options = await query('SELECT * FROM answer_option WHERE pergunta_id = $1 ORDER BY valor', [questionId]);
    return res.json({ ...result.rows[0], opcoes: options.rows });
  }

  const question = appStore.perguntas.find((item) => item.id === questionId && !item.geral);
  if (!question) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  if (!canManageSector(req.user, question.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  Object.assign(question, payload.data);
  if (payload.data.opcoes !== undefined) {
    appStore.opcoesResposta = appStore.opcoesResposta.filter((option) => option.pergunta_id !== question.id);
    appStore.opcoesResposta.push(...payload.data.opcoes.map((option) => ({
      id: appStore.opcoesResposta.length + 1,
      pergunta_id: question.id,
      ...option,
    })));
  }
  return res.json({
    ...question,
    opcoes: appStore.opcoesResposta.filter((option) => option.pergunta_id === question.id),
  });
}));

router.get('/admin/equipes', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const setorId = req.query.setor_id ? Number(req.query.setor_id) : req.user.setor_id;
  if (!setorId || !canManageSector(req.user, setorId)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  if (databaseConfigured) {
    const result = await query(
      `SELECT e.*, COUNT(es.profissional_id)::integer AS profissionais
       FROM care_team e LEFT JOIN staff_shift es ON es.equipe_id = e.id
       WHERE e.setor_id = $1
       GROUP BY e.id ORDER BY e.data DESC, e.turno`,
      [setorId],
    );
    return res.json(result.rows);
  }
  return res.json((appStore.equipes ?? []).filter((team) => team.setor_id === setorId));
}));

router.post('/admin/equipes', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const payload = teamSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  if (!canManageSector(req.user, payload.data.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO care_team (setor_id, nome, data, turno) VALUES ($1, $2, $3, $4) RETURNING *`,
      [payload.data.setor_id, payload.data.nome, payload.data.data, payload.data.turno],
    );
    return res.status(201).json(result.rows[0]);
  }
  const team = { id: (appStore.equipes?.length ?? 0) + 1, ...payload.data };
  appStore.equipes ??= [];
  appStore.equipes.push(team);
  return res.status(201).json(team);
}));

router.get('/admin/perfis', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT id, nome, permissoes FROM user_role ORDER BY id');
    return res.json(result.rows);
  }
  res.json(appStore.perfis);
}));

router.get('/admin/usuarios', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil_id, u.setor_id, u.ativo,
              COALESCE(p.permissoes->'roles', '[]'::json) AS permissoes
       FROM user_account u JOIN user_role p ON p.id = u.perfil_id
       ORDER BY u.id`,
    );
    return res.json(result.rows);
  }
  res.json(appStore.usuarios.map(({ senha_hash, ...user }) => user));
}));

export default router;
