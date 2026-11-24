import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../core/memory.js';
import { env } from '../../runtime/env.js';
import { issueToken } from '../auth/auth.js';

const createdQuestions = [];
const createdTeams = [];
const createdSurveys = [];

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
  for (const id of createdSurveys.splice(0)) {
    const index = appStore.pesquisas.findIndex((survey) => survey.id === id);
    if (index >= 0) appStore.pesquisas.splice(index, 1);
  }
  for (const id of createdTeams.splice(0)) {
    const index = appStore.equipes.findIndex((team) => team.id === id);
    if (index >= 0) appStore.equipes.splice(index, 1);
  }
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
    const privacy = await request(app).get('/api/privacidade');
    let tvwall;
    if (env.tvWallPrivate) {
      const unauthorized = await request(app).get('/api/tvwall');
      const ouvidoriaToken = (await request(app)
        .post('/api/auth/login')
        .send({ email: 'ouvidoria@fundacao.com', senha: 'ouvidoria123' })).body.token;
      const denied = await request(app)
        .get('/api/tvwall')
        .set('Authorization', `Bearer ${ouvidoriaToken}`);
      const sectorAdmin = {
        id: 9878,
        nome: 'Admin de setor',
        email: 'admin-tvwall@fundacao.com',
        perfil_id: 2,
        perfil: 'admin_setor',
        setor_id: 1,
        ativo: true,
        permissoes: ['admin_setor'],
      };
      appStore.usuarios.push(sectorAdmin);
      let sectorAdminView;
      try {
        sectorAdminView = await request(app)
          .get('/api/tvwall')
          .set('Authorization', `Bearer ${issueToken(sectorAdmin)}`);
      } finally {
        appStore.usuarios.splice(appStore.usuarios.indexOf(sectorAdmin), 1);
      }
      const adminToken = await loginAsSuperAdmin();
      expect(unauthorized.status).toBe(401);
      expect(denied.status).toBe(403);
      expect(sectorAdminView.status).toBe(200);
      tvwall = await request(app)
        .get('/api/tvwall')
        .set('Authorization', `Bearer ${adminToken}`);
    } else {
      tvwall = await request(app).get('/api/tvwall');
    }

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

  it('only exports team names after the five-response privacy threshold', async () => {
    const token = await loginAsSuperAdmin();
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const teamForOneResponse = await request(app)
      .post('/api/admin/equipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ setor_id: 5, nome: `Equipe pequena ${Date.now()}`, data: date, turno: currentShift() });
    const teamForFiveResponses = await request(app)
      .post('/api/admin/equipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ setor_id: 6, nome: `Equipe suficiente ${Date.now()}`, data: date, turno: currentShift() });
    expect(teamForOneResponse.status).toBe(201);
    expect(teamForFiveResponses.status).toBe(201);
    createdTeams.push(teamForOneResponse.body.id, teamForFiveResponses.body.id);

    for (let index = 0; index < 6; index += 1) {
      const survey = await request(app)
        .post('/api/pesquisas')
        .send({ setor_id: index === 0 ? 5 : 6 });
      expect(survey.status).toBe(201);
      createdSurveys.push(survey.body.pesquisa_id);
    }

    const response = await request(app)
      .get('/api/reports/excel')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(teamForOneResponse.body.nome);
    expect(response.text).toContain(teamForFiveResponses.body.nome);
  });
});