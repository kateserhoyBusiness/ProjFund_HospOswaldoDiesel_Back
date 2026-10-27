import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../core/memory.js';
import { requireAuth } from '../auth/auth.js';
import { asyncHandler, databaseConfigured, query } from '../../runtime/database.js';
import { AppError } from '../../core/errors.js';

const router = Router();

const filtersSchema = z.object({
  setor_id: z.coerce.number().int().positive().optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  turno: z.enum(['manha', 'tarde', 'noite']).optional(),
});

const requireExportAccess = (req, _res, next) => {
  const allowed = ['super_admin', 'admin_setor', 'gestao', 'ouvidoria', 'visualizador'];
  if ((req.user?.permissoes ?? []).some((permission) => allowed.includes(permission))) return next();
  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

const xmlEscape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const makeWorkbook = (rows) => {
  const columns = [
    ['Pesquisa', 'id'],
    ['Data e hora', 'data_hora'],
    ['Setor', 'setor'],
    ['Turno', 'turno'],
    ['Equipe', 'equipe'],
    ['Média do setor', 'media_parcial'],
    ['NPS', 'nps_nota'],
    ['Situação', 'status'],
    ['Encaminhada à Ouvidoria', 'encaminhado_ouvidoria'],
  ];
  const rowXml = (values) => `<Row>${values.map((value) =>
    `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`).join('')}</Row>`;
  const body = [rowXml(columns.map(([label]) => label)), ...rows.map((row) => rowXml(columns.map(([, key]) => row[key])))].join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Pesquisas"><Table>${body}</Table></Worksheet>
</Workbook>`;
};

router.get('/reports/excel', requireAuth, requireExportAccess, asyncHandler(async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: 'Filtros inválidos', codigo: 'VALIDATION_ERROR', detalhes: parsed.error.flatten() });
  }
  const scoped = !req.user.permissoes?.some((permission) => ['super_admin', 'gestao', 'ouvidoria', 'visualizador'].includes(permission));
  if (scoped && parsed.data.setor_id && Number(parsed.data.setor_id) !== Number(req.user.setor_id)) {
    throw new AppError('Setor fora do seu perfil de acesso', 403, 'FORBIDDEN');
  }
  const filters = {
    ...parsed.data,
    setor_id: scoped ? req.user.setor_id : parsed.data.setor_id ?? null,
  };
  const values = [filters.setor_id, filters.data_inicio ?? null, filters.data_fim ?? null, filters.turno ?? null];
  let rows;

  if (databaseConfigured) {
    const result = await query(
      `SELECT p.id, to_char(p.data_hora, 'YYYY-MM-DD HH24:MI:SS TZ') AS data_hora,
              s.nome AS setor, p.turno, COALESCE(e.nome, 'Não vinculado') AS equipe,
              p.media_parcial, p.nps_nota, p.status, p.encaminhado_ouvidoria
       FROM survey p JOIN sector s ON s.id = p.setor_id
       LEFT JOIN care_team e ON e.id = p.equipe_id
       WHERE ($1::integer IS NULL OR p.setor_id = $1)
         AND ($2::date IS NULL OR p.data_hora::date >= $2::date)
         AND ($3::date IS NULL OR p.data_hora::date <= $3::date)
         AND ($4::text IS NULL OR p.turno = $4)
       ORDER BY p.data_hora DESC`,
      values,
    );
    rows = result.rows;
    await query(
      `INSERT INTO report_export (usuario_id, tipo, filtros) VALUES ($1, 'excel', $2::jsonb)`,
      [req.user.id, JSON.stringify(filters)],
    );
  } else {
    rows = appStore.pesquisas
      .filter((survey) => (!filters.setor_id || survey.setor_id === Number(filters.setor_id))
        && (!filters.turno || survey.turno === filters.turno)
        && (!filters.data_inicio || survey.data_hora.slice(0, 10) >= filters.data_inicio)
        && (!filters.data_fim || survey.data_hora.slice(0, 10) <= filters.data_fim))
      .map((survey) => ({
        id: survey.id,
        data_hora: survey.data_hora,
        setor: appStore.setores.find((sector) => sector.id === survey.setor_id)?.nome ?? '',
        turno: survey.turno,
        equipe: appStore.equipes.find((team) => team.id === survey.equipe_id)?.nome ?? 'Não vinculado',
        media_parcial: survey.media_parcial,
        nps_nota: survey.nps_nota,
        status: survey.status,
        encaminhado_ouvidoria: survey.encaminhado_ouvidoria,
      }));
    appStore.exports.push({
      id: appStore.exports.length + 1,
      usuario_id: req.user.id,
      tipo: 'excel',
      data: new Date().toISOString(),
      filtros: filters,
    });
  }

  res.type('application/vnd.ms-excel; charset=utf-8');
  res.attachment('pesquisas-satisfacao.xls');
  return res.send(`\uFEFF${makeWorkbook(rows)}`);
}));

router.get('/reports/pdf', requireAuth, requireExportAccess, (_req, res) => {
  res.status(501).json({ erro: 'Exportação PDF indisponível', codigo: 'EXPORT_FORMAT_UNAVAILABLE' });
});

export default router;