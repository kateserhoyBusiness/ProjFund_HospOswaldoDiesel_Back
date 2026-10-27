import { Router } from 'express';
import { appStore } from '../../core/memory.js';
import { calculateAverage, calculateNps } from '../../core/metrics.js';
import { requireAuth } from '../auth/auth.js';
import { asyncHandler, databaseConfigured, query } from '../../runtime/database.js';
import { AppError } from '../../core/errors.js';
import { z } from 'zod';

const router = Router();

const filterSchema = z.object({
  setor_id: z.coerce.number().int().positive().optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  turno: z.enum(['manha', 'tarde', 'noite']).optional(),
});

const requireDashboardAccess = (req, _res, next) => {
  const allowed = ['super_admin', 'admin_setor', 'gestao', 'ouvidoria', 'visualizador'];
  if ((req.user?.permissoes ?? []).some((permission) => allowed.includes(permission))) return next();
  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

const getFilters = (req) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError('Filtros inválidos', 400, 'VALIDATION_ERROR');
  const scoped = !req.user.permissoes?.some((permission) => ['super_admin', 'gestao', 'ouvidoria', 'visualizador'].includes(permission));
  if (scoped && parsed.data.setor_id && Number(parsed.data.setor_id) !== Number(req.user.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  return {
    ...parsed.data,
    setor_id: scoped ? req.user.setor_id : parsed.data.setor_id ?? null,
  };
};

const filterSql = `($1::integer IS NULL OR p.setor_id = $1)
  AND ($2::date IS NULL OR p.data_hora::date >= $2::date)
  AND ($3::date IS NULL OR p.data_hora::date <= $3::date)
  AND ($4::text IS NULL OR p.turno = $4)`;

const filterValues = (filters) => [filters.setor_id ?? null, filters.data_inicio ?? null, filters.data_fim ?? null, filters.turno ?? null];

const applyMemoryFilters = (surveys, filters) => surveys.filter((survey) => {
  const date = survey.data_hora?.slice(0, 10);
  return (!filters.setor_id || survey.setor_id === Number(filters.setor_id))
    && (!filters.turno || survey.turno === filters.turno)
    && (!filters.data_inicio || date >= filters.data_inicio)
    && (!filters.data_fim || date <= filters.data_fim);
});

router.get('/dashboard/resumo', requireAuth, requireDashboardAccess, asyncHandler(async (req, res) => {
  const filters = getFilters(req);
  if (databaseConfigured) {
    const result = await query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'parcial')::integer AS parciais,
              COUNT(*) FILTER (WHERE status = 'concluida')::integer AS concluidas,
              AVG(media_parcial) AS media,
              ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas
       FROM survey p WHERE ${filterSql}`,
      filterValues(filters),
    );
    const row = result.rows[0];
    return res.json({
      nps_geral: calculateNps((row.notas ?? []).map(Number)),
      media_geral: row.media === null ? null : Number(Number(row.media).toFixed(1)),
      total_pesquisas: row.total,
      percentual_parciais: row.total ? (row.parciais / row.total) * 100 : 0,
      pesquisas_concluidas: row.concluidas,
      filtros: filters,
    });
  }

  const surveys = applyMemoryFilters(appStore.pesquisas, filters);
  const notas = surveys.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const totalParciais = surveys.filter((item) => item.status === 'parcial').length;
  res.json({
    nps_geral: calculateNps(notas),
    media_geral: calculateAverage(surveys.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial ?? 0)),
    total_pesquisas: surveys.length,
    pesquisas_concluidas: surveys.filter((item) => item.status === 'concluida').length,
    percentual_parciais: surveys.length ? (totalParciais / surveys.length) * 100 : 0,
    filtros: filters,
  });
}));

router.get('/dashboard/setores', requireAuth, requireDashboardAccess, asyncHandler(async (req, res) => {
  const filters = getFilters(req);
  if (databaseConfigured) {
    const result = await query(
      `SELECT s.id AS setor_id, s.nome,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas,
              AVG(p.media_parcial) FILTER (WHERE p.nps_nota IS NOT NULL) AS media
       FROM sector s
       LEFT JOIN survey p ON p.setor_id = s.id
       WHERE s.ativo = TRUE AND ${filterSql}
       GROUP BY s.id
       ORDER BY s.id`,
      filterValues(filters),
    );
    return res.json(result.rows.map((row) => ({
      setor_id: row.setor_id,
      nome: row.nome,
      nps: calculateNps((row.notas ?? []).map(Number)),
      media: row.media === null ? null : Number(Number(row.media).toFixed(1)),
    })));
  }

  const surveys = applyMemoryFilters(appStore.pesquisas, filters);
  const setores = appStore.setores.filter((setor) => setor.ativo && (!filters.setor_id || setor.id === Number(filters.setor_id))).map((setor) => {
    const pesquisas = surveys.filter((item) => item.setor_id === setor.id && item.nps_nota !== null);
    return {
      setor_id: setor.id,
      nome: setor.nome,
      nps: calculateNps(pesquisas.map((item) => item.nps_nota)),
      media: calculateAverage(pesquisas.map((item) => item.media_parcial ?? 0)),
    };
  });
  res.json(setores);
}));

router.get('/dashboard/setores/:id/turnos', requireAuth, requireDashboardAccess, asyncHandler(async (req, res) => {
  const setorId = Number(req.params.id);
  const filters = getFilters(req);
  const unrestricted = req.user.permissoes?.some((permission) => ['super_admin', 'gestao', 'ouvidoria', 'visualizador'].includes(permission));
  if (!unrestricted && Number(req.user.setor_id) !== setorId) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  const turnos = ['manha', 'tarde', 'noite'];

  if (databaseConfigured) {
    const result = await query(
      `SELECT turno, COUNT(*) FILTER (WHERE nps_nota IS NOT NULL)::integer AS total,
              ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas,
              AVG(media_parcial) FILTER (WHERE nps_nota IS NOT NULL) AS media
       FROM survey p WHERE p.setor_id = $1
         AND ($2::date IS NULL OR p.data_hora::date >= $2::date)
         AND ($3::date IS NULL OR p.data_hora::date <= $3::date)
         AND ($4::text IS NULL OR p.turno = $4)
       GROUP BY turno`,
      [setorId, filters.data_inicio ?? null, filters.data_fim ?? null, filters.turno ?? null],
    );
    const byTurn = new Map(result.rows.map((row) => [row.turno, row]));
    return res.json(turnos.map((turno) => {
      const row = byTurn.get(turno);
      return {
        turno,
        total: row?.total ?? 0,
        nps: calculateNps((row?.notas ?? []).map(Number)),
        media: row?.media === null || row?.media === undefined
          ? null
          : Number(Number(row.media).toFixed(1)),
      };
    }));
  }

  const payload = turnos.map((turno) => {
    const pesquisas = applyMemoryFilters(appStore.pesquisas, { ...filters, setor_id: setorId })
      .filter((item) => item.turno === turno && item.nps_nota !== null);
    return {
      turno,
      total: pesquisas.length,
      nps: calculateNps(pesquisas.map((item) => item.nps_nota)),
      media: calculateAverage(pesquisas.map((item) => item.media_parcial ?? 0)),
    };
  });
  res.json(payload);
}));

router.get('/dashboard/equipes', requireAuth, requireDashboardAccess, asyncHandler(async (req, res) => {
  const filters = getFilters(req);
  let teams;
  if (databaseConfigured) {
    const result = await query(
      `SELECT e.id AS equipe_id, e.nome AS equipe, e.data::text AS data, e.turno,
              s.id AS setor_id, s.nome AS setor,
              COUNT(p.id)::integer AS total,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas,
              AVG(p.media_parcial) FILTER (WHERE p.media_parcial IS NOT NULL) AS media
       FROM care_team e JOIN sector s ON s.id = e.setor_id
       LEFT JOIN survey p ON p.equipe_id = e.id
       WHERE s.ativo = TRUE
         AND ($1::integer IS NULL OR e.setor_id = $1)
         AND ($2::date IS NULL OR e.data >= $2::date)
         AND ($3::date IS NULL OR e.data <= $3::date)
         AND ($4::text IS NULL OR e.turno = $4)
       GROUP BY e.id, s.id ORDER BY e.data DESC, e.turno`,
      filterValues(filters),
    );
    teams = result.rows.map((row) => ({
      ...row,
      nps: calculateNps((row.notas ?? []).map(Number)),
      media: row.media === null ? null : Number(Number(row.media).toFixed(1)),
      total: Number(row.total),
    }));
  } else {
    const surveys = applyMemoryFilters(appStore.pesquisas, filters);
    teams = (appStore.equipes ?? [])
      .filter((team) => (!filters.setor_id || team.setor_id === Number(filters.setor_id))
        && (!filters.data_inicio || team.data >= filters.data_inicio)
        && (!filters.data_fim || team.data <= filters.data_fim)
        && (!filters.turno || team.turno === filters.turno))
      .map((team) => {
        const teamSurveys = surveys.filter((survey) => survey.equipe_id === team.id);
        return {
          equipe_id: team.id,
          equipe: team.nome,
          setor_id: team.setor_id,
          setor: appStore.setores.find((sector) => sector.id === team.setor_id)?.nome,
          data: team.data,
          turno: team.turno,
          total: teamSurveys.length,
          nps: calculateNps(teamSurveys.filter((survey) => survey.nps_nota !== null).map((survey) => survey.nps_nota)),
          media: calculateAverage(teamSurveys.filter((survey) => survey.media_parcial !== null).map((survey) => survey.media_parcial)),
        };
      });
  }
  const ranked = teams.filter((team) => team.total > 0).sort((a, b) => b.nps - a.nps);
  return res.json({ equipes: teams, melhores: ranked.slice(0, 3), piores: ranked.slice(-3).reverse(), filtros: filters });
}));

router.get('/dashboard/em-andamento', requireAuth, requireDashboardAccess, asyncHandler(async (req, res) => {
  const filters = getFilters(req);
  if (databaseConfigured) {
    const result = await query(
      `SELECT id, setor_id, media_parcial, ultima_atividade, status
       FROM survey p WHERE status = 'em_andamento' AND ${filterSql} ORDER BY ultima_atividade DESC`,
      filterValues(filters),
    );
    return res.json(result.rows);
  }
  const pesquisas = applyMemoryFilters(appStore.pesquisas, filters).filter((item) => item.status === 'em_andamento');
  res.json(pesquisas.map((pesquisa) => ({
    id: pesquisa.id,
    setor_id: pesquisa.setor_id,
    media_parcial: pesquisa.media_parcial,
    ultima_atividade: pesquisa.ultima_atividade,
    status: pesquisa.status,
  })));
}));

export default router;
