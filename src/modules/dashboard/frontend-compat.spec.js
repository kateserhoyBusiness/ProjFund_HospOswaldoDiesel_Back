import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../core/memory.js';
import { issueToken } from '../auth/auth.js';

const login = async (email, senha) => {
  const response = await request(app).post('/api/auth/login').send({ email, senha });
  expect(response.status).toBe(200);
  return response.body.token;
};

describe('frontend integration contracts', () => {
  it('returns anonymous dashboard rows only to authenticated management profiles', async () => {
    const survey = await request(app).post('/api/pesquisas').send({ setor_id: 1 });
    expect(survey.status).toBe(201);

    const unauthorized = await request(app).get('/api/dashboard/pesquisas');
    expect(unauthorized.status).toBe(401);

    const token = await login('super@fundacao.com', 'super123');
    const response = await request(app)
      .get('/api/dashboard/pesquisas')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: survey.body.pesquisa_id,
        setor_slug: 'recepcao',
        status: 'em_andamento',
      }),
    ]));
    expect(response.body[0]).not.toHaveProperty('token');
    expect(response.body[0]).not.toHaveProperty('paciente_id');
  });

  it('requires explicit consent before storing a feedback contact', async () => {
    const survey = await request(app).post('/api/pesquisas').send({ setor_id: 1 });
    const submitFeedback = (body) => request(app)
      .post(`/api/pesquisas/${survey.body.pesquisa_id}/manifestacoes`)
      .set('x-survey-token', survey.body.token)
      .send(body);
    const feedback = {
      tipo: 'reclamacao',
      descricao: 'Preciso de retorno sobre o atendimento.',
      anonimo: false,
      canal_contato: '11999999999',
    };
    const response = await submitFeedback(feedback);
    expect(response.status).toBe(400);
    expect(response.body.codigo).toBe('VALIDATION_ERROR');

    const accepted = await submitFeedback({ ...feedback, consentimento: true });
    expect(accepted.status).toBe(201);
    const token = await login('ouvidoria@fundacao.com', 'ouvidoria123');
    const inbox = await request(app)
      .get('/api/manifestacoes')
      .set('Authorization', `Bearer ${token}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: accepted.body.id, setor_slug: 'recepcao' }),
    ]));
  });

  it('limits management dashboard rows to the user sector', async () => {
    const first = await request(app).post('/api/pesquisas').send({ setor_id: 1 });
    const second = await request(app).post('/api/pesquisas').send({ setor_id: 2 });
    const user = {
      id: 9876,
      nome: 'Gestão Recepção',
      email: 'gestao@fundacao.com',
      perfil_id: 3,
      perfil: 'gestao',
      setor_id: 1,
      ativo: true,
      permissoes: ['gestao'],
    };
    appStore.usuarios.push(user);
    const token = issueToken(user);

    try {
      const response = await request(app)
        .get('/api/dashboard/pesquisas')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.every((survey) => survey.setor_slug === 'recepcao')).toBe(true);
    } finally {
      appStore.usuarios.splice(appStore.usuarios.indexOf(user), 1);
      for (const id of [first.body.pesquisa_id, second.body.pesquisa_id]) {
        const index = appStore.pesquisas.findIndex((survey) => survey.id === id);
        if (index >= 0) appStore.pesquisas.splice(index, 1);
      }
    }
  });
});
