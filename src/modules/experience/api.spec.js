import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../core/memory.js';

const createdQuestions = [];

const loginAsSuperAdmin = async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'super@fundacao.com', senha: 'super123' });
  return response.body.token;
};

const currentShift = () => {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour < 12 ? 'manha' : hour < 18 ? 'tarde' : 'noite';
};

afterEach(() => {
  for (const questionId of createdQuestions.splice(0)) {
    const index = appStore.perguntas.findIndex((question) => question.id === questionId);
    if (index >= 0) appStore.perguntas.splice(index, 1);
    for (let optionIndex = appStore.opcoesResposta.length - 1; optionIndex >= 0; optionIndex -= 1) {
      if (appStore.opcoesResposta[optionIndex].pergunta_id === questionId) {
        appStore.opcoesResposta.splice(optionIndex, 1);
      }
    }
  }
});

describe('patient experience API', () => {
  it('creates optional sector questions through scoped administration', async () => {
    const token = await loginAsSuperAdmin();
    const response = await request(app)
      .post('/api/admin/perguntas')
      .set('Authorization', `Bearer ${token}`)
      .send({ setor_id: 2, texto: 'A triagem explicou os próximos passos?', tipo: 'rostinho' });

    expect(response.status).toBe(201);
    expect(response.body.geral).toBe(false);
    expect(response.body.obrigatoria).toBe(false);
    expect(response.body.opcoes).toHaveLength(5);
    createdQuestions.push(response.body.id);

    const update = await request(app)
      .patch(`/api/admin/perguntas/${response.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'A triagem foi clara?', opcoes: [
        { valor: 1, rotulo: 'Não', emoji: '🙁' },
        { valor: 5, rotulo: 'Sim', emoji: '🙂' },
      ] });
    expect(update.status).toBe(200);
    expect(update.body.opcoes).toHaveLength(2);
    expect(update.body.texto).toBe('A triagem foi clara?');
  });

  it('rejects face ratings outside the 1-to-5 scale', async () => {
    const survey = await request(app).post('/api/pesquisas').send({ setor_id: 1 });
    const response = await request(app)
      .put(`/api/pesquisas/${survey.body.pesquisa_id}/respostas/1`)
      .set('x-survey-token', survey.body.token)
      .send({ valor: 8, pergunta_id: 1 });

    expect(response.status).toBe(400);
    expect(response.body.codigo).toBe('INVALID_ANSWER');
  });

  it('links surveys to the scheduled team and returns team drill-down metrics', async () => {
    const token = await loginAsSuperAdmin();
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const team = await request(app)
      .post('/api/admin/equipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ setor_id: 1, nome: 'Equipe de teste', data: date, turno: currentShift() });
    expect(team.status).toBe(201);

    const survey = await request(app).post('/api/pesquisas').send({ setor_id: 1 });
    const analytics = await request(app)
      .get('/api/dashboard/equipes?setor_id=1')
      .set('Authorization', `Bearer ${token}`);

    expect(survey.status).toBe(201);
    expect(analytics.status).toBe(200);
    expect(analytics.body.equipes).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipe: 'Equipe de teste', total: 1, turno: currentShift() }),
    ]));
  });

  it('serves privacy information and suppresses small public TV Wall samples', async () => {
    const [privacy, tvwall] = await Promise.all([
      request(app).get('/api/privacidade'),
      request(app).get('/api/tvwall'),
    ]);

    expect(privacy.status).toBe(200);
    expect(privacy.body.lei_url).toContain('l13709.htm');
    expect(privacy.body.retencao_dias).toBe(365);
    expect(tvwall.status).toBe(200);
    expect(tvwall.body.nps_geral).toBeNull();
    expect(tvwall.body.minimo_respostas).toBe(5);
  });

  it('downloads a filtered Excel-readable workbook without patient contact details', async () => {
    const token = await loginAsSuperAdmin();
    const response = await request(app)
      .get('/api/reports/excel?setor_id=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('pesquisas-satisfacao.xls');
    expect(response.text).toContain('<Workbook');
    expect(response.text).toContain('NPS');
    expect(response.text).not.toContain('telefone');
  });
});