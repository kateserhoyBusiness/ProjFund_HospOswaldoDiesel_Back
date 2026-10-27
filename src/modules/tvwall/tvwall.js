import { Router } from 'express';
import { appStore } from '../../core/memory.js';
import { calculateAverage, calculateNps } from '../../core/metrics.js';
import { asyncHandler, databaseConfigured, query } from '../../runtime/database.js';

const router = Router();
const MINIMUM_PUBLIC_RESPONSES = 5;

router.get('/tvwall', asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const [surveys, sectors, compliments] = await Promise.all([
      query(
        `SELECT COUNT(nps_nota)::integer AS total,
          ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas,
                ARRAY_AGG(media_parcial) FILTER (WHERE media_parcial IS NOT NULL) AS medias
         FROM survey`,
      ),
      query(
        `SELECT s.nome, s.slug, COUNT(p.nps_nota)::integer AS total,
                ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas
         FROM sector s LEFT JOIN survey p ON p.setor_id = s.id
         WHERE s.ativo = TRUE GROUP BY s.id ORDER BY s.id`,
      ),
      query(`SELECT COUNT(*)::integer AS total FROM feedback WHERE tipo = 'elogio'`),
    ]);
    const row = surveys.rows[0];
    const total = Number(row.total);
    return res.json({
      nps_geral: total >= MINIMUM_PUBLIC_RESPONSES ? calculateNps((row.notas ?? []).map(Number)) : null,
      media_geral: total >= MINIMUM_PUBLIC_RESPONSES ? calculateAverage((row.medias ?? []).map(Number)) : null,
      total_respostas: total >= MINIMUM_PUBLIC_RESPONSES ? total : null,
      setores: sectors.rows.map((sector) => ({
        nome: sector.nome,
        slug: sector.slug,
        nps: Number(sector.total) >= MINIMUM_PUBLIC_RESPONSES
          ? calculateNps((sector.notas ?? []).map(Number))
          : null,
        total_respostas: Number(sector.total) >= MINIMUM_PUBLIC_RESPONSES ? Number(sector.total) : null,
      })),
      elogios_gerais: compliments.rows[0].total,
      cache_seconds: 30,
      minimo_respostas: MINIMUM_PUBLIC_RESPONSES,
    });
  }

  const notas = appStore.pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const medias = appStore.pesquisas.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial);

  res.json({
    nps_geral: notas.length >= MINIMUM_PUBLIC_RESPONSES ? calculateNps(notas) : null,
    media_geral: notas.length >= MINIMUM_PUBLIC_RESPONSES ? calculateAverage(medias) : null,
    total_respostas: notas.length >= MINIMUM_PUBLIC_RESPONSES ? notas.length : null,
    setores: appStore.setores.filter((setor) => setor.ativo).map((setor) => ({
      nome: setor.nome,
      slug: setor.slug,
      nps: (() => {
        const scores = appStore.pesquisas.filter((item) => item.setor_id === setor.id && item.nps_nota !== null).map((item) => item.nps_nota);
        return scores.length >= MINIMUM_PUBLIC_RESPONSES ? calculateNps(scores) : null;
      })(),
      total_respostas: (() => {
        const total = appStore.pesquisas.filter((item) => item.setor_id === setor.id && item.nps_nota !== null).length;
        return total >= MINIMUM_PUBLIC_RESPONSES ? total : null;
      })(),
    })),
    elogios_gerais: appStore.manifestacoes.filter((item) => item.tipo === 'elogio').length,
    cache_seconds: 30,
    minimo_respostas: MINIMUM_PUBLIC_RESPONSES,
  });
}));

export default router;
