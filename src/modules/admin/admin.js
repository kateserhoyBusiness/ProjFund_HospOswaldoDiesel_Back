import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { appStore } from '../../core/memory.js';
import { getUserSectorIds, requireAuth, requirePermission } from '../auth/auth.js';
import { asyncHandler, databaseConfigured, query, withTransaction } from '../../runtime/database.js';
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
  tipo: z.enum(['rostinho', 'nps', 'texto', 'multipla']),
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
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  turno: z.enum(['manha', 'tarde', 'noite']).nullable().optional(),
  permanente: z.boolean().optional().default(false),
}).superRefine((team, context) => {
  if (!team.permanente && (!team.data || !team.turno)) {
    context.addIssue({
      code: 'custom',
      path: ['data'],
      message: 'Informe a data e o turno para uma equipe temporária.',
    });
  }
});

const assignablePermissions = new Set(['admin_setor', 'gestao', 'ouvidoria', 'visualizador']);
const passwordSchema = z.string().min(8).max(72).refine(
  (password) => Buffer.byteLength(password, 'utf8') <= 72,
  'A senha deve ter no máximo 72 bytes.',
);
const accountFields = {
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  perfil_id: z.number().int().positive(),
  setor_id: z.number().int().positive().nullable().optional(),
  setor_ids: z.array(z.number().int().positive()).optional(),
};
const accountCreateSchema = z.object({
  ...accountFields,
  senha: passwordSchema,
}).strict().superRefine((account, context) => {
  if (account.setor_ids && new Set(account.setor_ids).size !== account.setor_ids.length) {
    context.addIssue({ code: 'custom', path: ['setor_ids'], message: 'Não repita setores.' });
  }
});
const accountUpdateSchema = z.object({
  nome: accountFields.nome.optional(),
  email: accountFields.email.optional(),
  perfil_id: accountFields.perfil_id.optional(),
  setor_id: accountFields.setor_id.optional(),
  setor_ids: accountFields.setor_ids,
  senha: passwordSchema.optional(),
  ativo: z.boolean().optional(),
}).strict()
  .superRefine((account, context) => {
    if (account.setor_ids && new Set(account.setor_ids).size !== account.setor_ids.length) {
      context.addIssue({ code: 'custom', path: ['setor_ids'], message: 'Não repita setores.' });
    }
  })
  .refine((account) => Object.keys(account).length > 0, 'Informe ao menos um campo para atualizar.');

const getRolePermissions = (role) => {
  if (Array.isArray(role?.permissoes)) return role.permissoes;
  return Array.isArray(role?.permissoes?.roles) ? role.permissoes.roles : [];
};

const getAssignablePermission = (role) => {
  const permissions = getRolePermissions(role);
  return permissions.length === 1 && assignablePermissions.has(permissions[0])
    ? permissions[0]
    : null;
};

const getAssignableRole = async (roleId) => {
  let role;
  if (databaseConfigured) {
    const result = await query(
      `SELECT id, nome, COALESCE(permissoes->'roles', '[]'::jsonb) AS permissoes
       FROM user_role WHERE id = $1`,
      [roleId],
    );
    role = result.rows[0];
  } else {
    role = appStore.perfis.find((item) => item.id === roleId);
  }

  if (!role || !getAssignablePermission(role)) {
    throw new AppError('Perfil inválido ou não atribuível', 400, 'INVALID_PROFILE');
  }
  return { ...role, permission: getAssignablePermission(role) };
};

const getAssignableRoles = async () => {
  const roles = databaseConfigured
    ? (await query(
        `SELECT id, nome, COALESCE(permissoes->'roles', '[]'::jsonb) AS permissoes
         FROM user_role ORDER BY id`,
      )).rows
    : appStore.perfis;
  return roles
    .filter((role) => getAssignablePermission(role))
    .map((role) => ({ ...role, perfil: getAssignablePermission(role) }));
};

const validateAccountSectors = async (permission, sectorIds) => {
  if (['admin_setor', 'gestao'].includes(permission) && !sectorIds.length) {
    throw new AppError('Informe ao menos um setor para este perfil', 400, 'SECTOR_REQUIRED');
  }
  if (!sectorIds.length) return;

  const validIds = databaseConfigured
    ? (await query('SELECT id FROM sector WHERE id = ANY($1::integer[]) AND ativo = TRUE', [sectorIds])).rows.map((row) => Number(row.id))
    : appStore.setores.filter((sector) => sectorIds.includes(sector.id) && sector.ativo).map((sector) => sector.id);
  if (validIds.length !== sectorIds.length) {
    throw new AppError('Um ou mais setores são inválidos ou inativos', 400, 'INVALID_SECTOR');
  }
};

const mapAccountConflict = (error) => {
  if (error?.code === '23505') {
    throw new AppError('Já existe uma conta com este e-mail', 409, 'EMAIL_ALREADY_EXISTS');
  }
  throw error;
};

const accountResponse = ({ id, nome, email, perfil_id, setor_id, setor_ids, ativo, perfil, perfil_nome, permissoes }) => {
  const normalizedSectorIds = getUserSectorIds({ setor_ids, setor_id });
  return {
    id,
    nome,
    email,
    perfil_id,
    perfil: perfil ?? (Array.isArray(permissoes) ? permissoes[0] : undefined),
    perfil_nome,
    setor_id: setor_id ?? normalizedSectorIds[0] ?? null,
    setor_ids: normalizedSectorIds,
    ativo,
    permissoes: Array.isArray(permissoes) ? permissoes : [],
  };
};

const questionUpdateSchema = z.object({
  texto: z.string().trim().min(5).max(500).optional(),
  tipo: z.enum(['rostinho', 'nps', 'texto', 'multipla']).optional(),
  ordem: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  opcoes: optionsSchema.optional(),
});

const requireQuestionManager = (req, _res, next) => {
  const permissions = new Set(req.user?.permissoes ?? []);
  if (permissions.has('super_admin') || permissions.has('admin_setor') || permissions.has('gestao')) return next();
  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

const canManageSector = (user, sectorId) =>
  user?.permissoes?.includes('super_admin') || getUserSectorIds(user).includes(Number(sectorId));

const getQuestionSectorScope = (req) => {
  const unrestricted = req.user.permissoes?.includes('super_admin');
  const allowedSectorIds = unrestricted ? null : getUserSectorIds(req.user);
  const requestedSectorId = req.query.setor_id === undefined ? null : Number(req.query.setor_id);
  if (requestedSectorId !== null) {
    if (!Number.isSafeInteger(requestedSectorId) || !canManageSector(req.user, requestedSectorId)) {
      throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
    }
    return [requestedSectorId];
  }
  if (!unrestricted && !allowedSectorIds.length) {
    throw new AppError('Nenhum setor atribuído ao perfil', 403, 'FORBIDDEN');
  }
  return allowedSectorIds;
};

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

router.patch('/admin/setores/:id', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const setorId = Number(req.params.id);
  if (!Number.isInteger(setorId) || setorId <= 0) throw new AppError('Setor inválido', 400, 'INVALID_SECTOR');

  const payload = setorSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const current = appStore.setores.find((setor) => setor.id === setorId);
  if (databaseConfigured) {
    const existing = await query('SELECT * FROM sector WHERE id = $1', [setorId]);
    if (!existing.rows.length) throw new AppError('Setor não encontrado', 404, 'SECTOR_NOT_FOUND');
  } else if (!current) {
    throw new AppError('Setor não encontrado', 404, 'SECTOR_NOT_FOUND');
  }

  const base = databaseConfigured ? (await query('SELECT * FROM sector WHERE id = $1', [setorId])).rows[0] : current;
  const nome = payload.data.nome ?? base.nome;
  const slug = payload.data.slug ?? base.slug;
  const ativo = payload.data.ativo ?? base.ativo;
  const duplicate = appStore.setores.find((setor) => setor.id !== setorId && setor.slug === slug);
  if (databaseConfigured) {
    const duplicateResult = await query('SELECT id FROM sector WHERE slug = $1 AND id <> $2', [slug, setorId]);
    if (duplicateResult.rows.length) throw new AppError('Já existe um setor com este endereço', 409, 'SECTOR_SLUG_EXISTS');
  } else if (duplicate) {
    throw new AppError('Já existe um setor com este endereço', 409, 'SECTOR_SLUG_EXISTS');
  }

  if (databaseConfigured) {
    const result = await query(
      `UPDATE sector SET nome = $1, slug = $2, url = $3, qrcode = $4, ativo = $5
       WHERE id = $6 RETURNING *`,
      [nome, slug, `/pesquisa/${slug}`, `/pesquisa/${slug}`, ativo, setorId],
    );
    return res.json(result.rows[0]);
  }

  Object.assign(current, { nome, slug, url: `/pesquisa/${slug}`, qrcode: `/pesquisa/${slug}`, ativo });
  return res.json(current);
}));

router.delete('/admin/setores/:id', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const setorId = Number(req.params.id);
  if (!Number.isInteger(setorId) || setorId <= 0) throw new AppError('Setor inválido', 400, 'INVALID_SECTOR');

  if (databaseConfigured) {
    const result = await query('UPDATE sector SET ativo = FALSE WHERE id = $1 RETURNING *', [setorId]);
    if (!result.rows.length) throw new AppError('Setor não encontrado', 404, 'SECTOR_NOT_FOUND');
    return res.json(result.rows[0]);
  }

  const setor = appStore.setores.find((item) => item.id === setorId);
  if (!setor) throw new AppError('Setor não encontrado', 404, 'SECTOR_NOT_FOUND');
  setor.ativo = false;
  return res.json(setor);
}));

router.get('/admin/perguntas', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const sectorIds = getQuestionSectorScope(req);

  if (databaseConfigured) {
    const result = await query(
      `SELECT p.*, COALESCE(json_agg(json_build_object(
        'id', o.id, 'valor', o.valor, 'rotulo', o.rotulo, 'emoji', o.emoji
      ) ORDER BY o.valor) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM question p LEFT JOIN answer_option o ON o.pergunta_id = p.id
      WHERE ($1::integer[] IS NULL OR p.setor_id = ANY($1))
      GROUP BY p.id ORDER BY p.ordem, p.id`,
      [sectorIds],
    );
    return res.json(result.rows);
  }

  const questions = appStore.perguntas
    .filter((item) => sectorIds === null || sectorIds.includes(item.setor_id))
    .map((question) => ({
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
  const sectorIds = getQuestionSectorScope(req);
  if (databaseConfigured) {
    const result = await query(
      `SELECT e.*, COUNT(es.profissional_id)::integer AS profissionais
       FROM care_team e LEFT JOIN staff_shift es ON es.equipe_id = e.id
       WHERE ($1::integer[] IS NULL OR e.setor_id = ANY($1))
       GROUP BY e.id ORDER BY e.data DESC, e.turno`,
      [sectorIds],
    );
    return res.json(result.rows);
  }
  return res.json((appStore.equipes ?? []).filter((team) =>
    sectorIds === null || sectorIds.includes(team.setor_id)));
}));

router.post('/admin/equipes', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const payload = teamSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  if (!canManageSector(req.user, payload.data.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  if (payload.data.permanente) {
    const existing = databaseConfigured
      ? (await query('SELECT id FROM care_team WHERE setor_id = $1 AND permanente = TRUE AND ativo = TRUE', [payload.data.setor_id])).rows
      : (appStore.equipes ?? []).filter((team) => team.setor_id === payload.data.setor_id && team.permanente && team.ativo !== false);
    if (existing.length) {
      throw new AppError('Já existe uma equipe fixa para este setor.', 409, 'PERMANENT_TEAM_EXISTS');
    }
  }
  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO care_team (setor_id, nome, data, turno, permanente)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        payload.data.setor_id,
        payload.data.nome,
        payload.data.permanente ? null : payload.data.data,
        payload.data.permanente ? null : payload.data.turno,
        payload.data.permanente,
      ],
    );
    return res.status(201).json(result.rows[0]);
  }
  const team = {
    id: (appStore.equipes?.length ?? 0) + 1,
    ...payload.data,
    data: payload.data.permanente ? null : payload.data.data,
    turno: payload.data.permanente ? null : payload.data.turno,
    ativo: true,
  };
  appStore.equipes ??= [];
  appStore.equipes.push(team);
  return res.status(201).json(team);
}));

router.delete('/admin/equipes/:id', requireAuth, requireQuestionManager, asyncHandler(async (req, res) => {
  const teamId = Number(req.params.id);
  if (!Number.isInteger(teamId) || teamId <= 0) throw new AppError('Equipe inválida', 400, 'INVALID_TEAM');

  const team = databaseConfigured
    ? (await query('SELECT id, setor_id FROM care_team WHERE id = $1 AND permanente = TRUE', [teamId])).rows[0]
    : (appStore.equipes ?? []).find((item) => item.id === teamId && item.permanente);
  if (!team) throw new AppError('Equipe fixa não encontrada', 404, 'TEAM_NOT_FOUND');
  if (!canManageSector(req.user, team.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }

  if (databaseConfigured) {
    const result = await query('UPDATE care_team SET ativo = FALSE WHERE id = $1 RETURNING *', [teamId]);
    return res.json(result.rows[0]);
  }

  team.ativo = false;
  return res.json(team);
}));

router.get('/admin/perfis', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  res.json(await getAssignableRoles());
}));

router.get('/admin/usuarios', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil_id, u.setor_id,
              COALESCE(
                (SELECT ARRAY_AGG(us.setor_id ORDER BY (us.setor_id = u.setor_id) DESC NULLS LAST, us.setor_id)
                 FROM user_sector us WHERE us.usuario_id = u.id),
                CASE WHEN u.setor_id IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[u.setor_id] END
              ) AS setor_ids,
              u.ativo, p.nome AS perfil_nome,
              COALESCE(p.permissoes->'roles', '[]'::jsonb) AS permissoes
       FROM user_account u JOIN user_role p ON p.id = u.perfil_id
       ORDER BY u.id`,
    );
    return res.json(result.rows.map(accountResponse));
  }
  res.json(appStore.usuarios.map((user) => {
    const role = appStore.perfis.find((item) => item.id === user.perfil_id);
    return accountResponse({
      ...user,
      perfil: user.perfil,
      perfil_nome: role?.nome,
      permissoes: getRolePermissions(role),
    });
  }));
}));

router.post('/admin/usuarios', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const payload = accountCreateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const role = await getAssignableRole(payload.data.perfil_id);
  const sectorIds = payload.data.setor_ids
    ?? (payload.data.setor_id == null ? [] : [payload.data.setor_id]);
  await validateAccountSectors(role.permission, sectorIds);
  const passwordHash = await bcrypt.hash(payload.data.senha, 12);
  const primarySectorId = sectorIds[0] ?? null;

  try {
    let account;
    if (databaseConfigured) {
      const duplicate = await query(
        'SELECT id FROM user_account WHERE LOWER(email) = LOWER($1)',
        [payload.data.email],
      );
      if (duplicate.rowCount) throw new AppError('Já existe uma conta com este e-mail', 409, 'EMAIL_ALREADY_EXISTS');
      account = await withTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO user_account (nome, email, perfil_id, setor_id, ativo, senha_hash)
           VALUES ($1, $2, $3, $4, TRUE, $5)
           RETURNING id, nome, email, perfil_id, setor_id, ativo`,
          [payload.data.nome, payload.data.email, role.id, primarySectorId, passwordHash],
        );
        if (sectorIds.length) {
          await client.query(
            `INSERT INTO user_sector (usuario_id, setor_id)
             SELECT $1, sectors.setor_id
             FROM UNNEST($2::integer[]) AS sectors(setor_id)`,
            [result.rows[0].id, sectorIds],
          );
        }
        return { ...result.rows[0], setor_ids: sectorIds };
      });
    } else {
      if (appStore.usuarios.some((user) => user.email.toLowerCase() === payload.data.email)) {
        throw new AppError('Já existe uma conta com este e-mail', 409, 'EMAIL_ALREADY_EXISTS');
      }
      account = {
        id: Math.max(0, ...appStore.usuarios.map((user) => user.id)) + 1,
        nome: payload.data.nome,
        email: payload.data.email,
        perfil_id: role.id,
        setor_id: primarySectorId,
        setor_ids: sectorIds,
        ativo: true,
        senha_hash: passwordHash,
        perfil: role.permission,
      };
      appStore.usuarios.push(account);
    }

    return res.status(201).json(accountResponse({
      ...account,
      perfil: role.permission,
      perfil_nome: role.nome,
      permissoes: getRolePermissions(role),
    }));
  } catch (error) {
    return mapAccountConflict(error);
  }
}));

router.patch('/admin/usuarios/:id', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const payload = accountUpdateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new AppError('Conta não encontrada', 404, 'USER_NOT_FOUND');
  }
  if (userId === Number(req.user.id) && payload.data.ativo === false) {
    throw new AppError('Não é permitido desativar a própria conta', 400, 'SELF_DEACTIVATION');
  }

  let current;
  let currentRole;
  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil_id, u.setor_id, u.ativo,
              COALESCE(
                (SELECT ARRAY_AGG(us.setor_id ORDER BY (us.setor_id = u.setor_id) DESC NULLS LAST, us.setor_id)
                 FROM user_sector us WHERE us.usuario_id = u.id),
                CASE WHEN u.setor_id IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[u.setor_id] END
              ) AS setor_ids,
              p.nome AS perfil_nome, COALESCE(p.permissoes->'roles', '[]'::jsonb) AS permissoes
       FROM user_account u JOIN user_role p ON p.id = u.perfil_id
       WHERE u.id = $1`,
      [userId],
    );
    current = result.rows[0];
    currentRole = current && {
      id: current.perfil_id,
      nome: current.perfil_nome,
      permissoes: current.permissoes,
    };
  } else {
    current = appStore.usuarios.find((user) => user.id === userId);
    currentRole = current && appStore.perfis.find((role) => role.id === current.perfil_id);
  }
  if (!current) throw new AppError('Conta não encontrada', 404, 'USER_NOT_FOUND');

  const role = payload.data.perfil_id === undefined
    ? {
        ...currentRole,
        permission: getAssignablePermission(currentRole) ?? getRolePermissions(currentRole)[0],
      }
    : await getAssignableRole(payload.data.perfil_id);
  const sectorIds = payload.data.setor_ids !== undefined
    ? payload.data.setor_ids
    : payload.data.setor_id !== undefined
      ? payload.data.setor_id === null ? [] : [payload.data.setor_id]
      : getUserSectorIds(current);
  const sectorId = sectorIds[0] ?? null;
  await validateAccountSectors(role.permission, sectorIds);
  const email = payload.data.email ?? current.email;
  const passwordHash = payload.data.senha ? await bcrypt.hash(payload.data.senha, 12) : null;

  try {
    let updated;
    if (databaseConfigured) {
      const duplicate = await query(
        'SELECT id FROM user_account WHERE LOWER(email) = LOWER($1) AND id <> $2',
        [email, userId],
      );
      if (duplicate.rowCount) throw new AppError('Já existe uma conta com este e-mail', 409, 'EMAIL_ALREADY_EXISTS');
      updated = await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE user_account
           SET nome = $2, email = $3, perfil_id = $4, setor_id = $5, ativo = $6,
               senha_hash = COALESCE($7, senha_hash)
           WHERE id = $1
           RETURNING id, nome, email, perfil_id, setor_id, ativo`,
          [
            userId,
            payload.data.nome ?? current.nome,
            email,
            role.id,
            sectorId,
            payload.data.ativo ?? current.ativo,
            passwordHash,
          ],
        );
        await client.query('DELETE FROM user_sector WHERE usuario_id = $1', [userId]);
        if (sectorIds.length) {
          await client.query(
            `INSERT INTO user_sector (usuario_id, setor_id)
             SELECT $1, sectors.setor_id
             FROM UNNEST($2::integer[]) AS sectors(setor_id)`,
            [userId, sectorIds],
          );
        }
        return { ...result.rows[0], setor_ids: sectorIds };
      });
    } else {
      Object.assign(current, {
        nome: payload.data.nome ?? current.nome,
        email,
        perfil_id: role.id,
        perfil: role.permission,
        setor_id: sectorId,
        setor_ids: sectorIds,
        ativo: payload.data.ativo ?? current.ativo,
      });
      if (passwordHash) current.senha_hash = passwordHash;
      updated = current;
    }

    return res.json(accountResponse({
      ...updated,
      perfil: role.permission,
      perfil_nome: role.nome,
      permissoes: getRolePermissions(role),
    }));
  } catch (error) {
    return mapAccountConflict(error);
  }
}));

export default router;
