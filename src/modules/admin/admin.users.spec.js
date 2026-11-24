import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../core/memory.js';
import { issueToken } from '../auth/auth.js';

const login = async (email, senha) => {
  const response = await request(app).post('/api/auth/login').send({ email, senha });
  expect(response.status).toBe(200);
  return response.body.token;
};

const createdUserIds = [];
const temporaryUsers = [];

afterEach(() => {
  for (const id of createdUserIds.splice(0)) {
    const index = appStore.usuarios.findIndex((user) => user.id === id);
    if (index >= 0) appStore.usuarios.splice(index, 1);
  }
  for (const user of temporaryUsers.splice(0)) {
    const index = appStore.usuarios.indexOf(user);
    if (index >= 0) appStore.usuarios.splice(index, 1);
  }
});

describe('admin user accounts', () => {
  it('requires an administrator for all account-management endpoints', async () => {
    const manager = appStore.usuarios.find((user) => user.email === 'ouvidoria@fundacao.com');
    const forgedToken = issueToken({ ...manager, perfil: 'super_admin', permissoes: ['super_admin'] });
    const deniedList = await request(app)
      .get('/api/admin/usuarios')
      .set('Authorization', `Bearer ${forgedToken}`);
    const deniedCreate = await request(app)
      .post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${forgedToken}`)
      .send({});
    const deniedUpdate = await request(app)
      .patch('/api/admin/usuarios/1')
      .set('Authorization', `Bearer ${forgedToken}`)
      .send({ ativo: false });

    expect(deniedList.status).toBe(403);
    expect(deniedCreate.status).toBe(403);
    expect(deniedUpdate.status).toBe(403);
  });

  it('lists accounts without hashes and only exposes assignable profiles', async () => {
    const token = await login('super@fundacao.com', 'super123');
    const [accounts, profiles] = await Promise.all([
      request(app).get('/api/admin/usuarios').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/admin/perfis').set('Authorization', `Bearer ${token}`),
    ]);

    expect(accounts.status).toBe(200);
    expect(accounts.body.every((user) => !Object.hasOwn(user, 'senha_hash'))).toBe(true);
    expect(profiles.status).toBe(200);
    expect(profiles.body.map((profile) => profile.perfil)).toEqual([
      'admin_setor',
      'gestao',
      'ouvidoria',
      'visualizador',
    ]);
  });

  it('creates, edits, and deactivates an account using validated backend roles', async () => {
    const token = await login('super@fundacao.com', 'super123');
    const headers = { Authorization: `Bearer ${token}` };
    const created = await request(app)
      .post('/api/admin/usuarios')
      .set(headers)
      .send({
        nome: 'Conta de Gestão',
        email: 'gestao-nova@fundacao.com',
        senha: 'senha-forte-123',
        perfil_id: 3,
        setor_id: 1,
        permissoes: ['super_admin'],
      });

    expect(created.status).toBe(400);

    const validCreate = await request(app)
      .post('/api/admin/usuarios')
      .set(headers)
      .send({
        nome: 'Conta de Gestão',
        email: 'gestao-nova@fundacao.com',
        senha: 'senha-forte-123',
        perfil_id: 3,
        setor_id: 1,
      });
    expect(validCreate.status).toBe(201);
    expect(validCreate.body).toMatchObject({
      email: 'gestao-nova@fundacao.com',
      perfil: 'gestao',
      setor_id: 1,
      permissoes: ['gestao'],
    });
    expect(validCreate.body).not.toHaveProperty('senha_hash');
    createdUserIds.push(validCreate.body.id);

    const account = appStore.usuarios.find((user) => user.id === validCreate.body.id);
    expect(account.senha_hash).not.toBe('senha-forte-123');
    expect(account.senha_hash).toMatch(/^\$2[aby]\$/);

    const withoutSector = await request(app)
      .post('/api/admin/usuarios')
      .set(headers)
      .send({
        nome: 'Conta de Ouvidoria',
        email: 'ouvidoria-nova@fundacao.com',
        senha: 'senha-forte-123',
        perfil_id: 4,
      });
    expect(withoutSector.status).toBe(201);
    expect(withoutSector.body.setor_id).toBeNull();
    createdUserIds.push(withoutSector.body.id);

    const missingSector = await request(app)
      .post('/api/admin/usuarios')
      .set(headers)
      .send({
        nome: 'Gestão sem setor',
        email: 'gestao-sem-setor@fundacao.com',
        senha: 'senha-forte-123',
        perfil_id: 3,
        setor_id: null,
      });
    const privilegedProfile = await request(app)
      .post('/api/admin/usuarios')
      .set(headers)
      .send({
        nome: 'Admin não permitido',
        email: 'admin-nao-permitido@fundacao.com',
        senha: 'senha-forte-123',
        perfil_id: 1,
        setor_id: null,
      });
    expect(missingSector.status).toBe(400);
    expect(missingSector.body.codigo).toBe('SECTOR_REQUIRED');
    expect(privilegedProfile.status).toBe(400);
    expect(privilegedProfile.body.codigo).toBe('INVALID_PROFILE');

    const updated = await request(app)
      .patch(`/api/admin/usuarios/${validCreate.body.id}`)
      .set(headers)
      .send({ perfil_id: 2, setor_id: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ perfil: 'admin_setor', setor_id: 2 });

    const invalidUpdate = await request(app)
      .patch(`/api/admin/usuarios/${validCreate.body.id}`)
      .set(headers)
      .send({ perfil_id: 1 });
    expect(invalidUpdate.status).toBe(400);

    const deactivated = await request(app)
      .patch(`/api/admin/usuarios/${validCreate.body.id}`)
      .set(headers)
      .send({ ativo: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.ativo).toBe(false);

    const loginAfterDeactivation = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gestao-nova@fundacao.com', senha: 'senha-forte-123' });
    expect(loginAfterDeactivation.status).toBe(401);
  });

  it('denies account management to every non-administrator profile', async () => {
    const token = await login('super@fundacao.com', 'super123');
    for (const roleId of [2, 3, 4, 5]) {
      const user = {
        id: 9000 + roleId,
        nome: `Usuário perfil ${roleId}`,
        email: `perfil-${roleId}@fundacao.com`,
        perfil_id: roleId,
        perfil: appStore.perfis.find((role) => role.id === roleId).permissoes[0],
        setor_id: roleId === 2 || roleId === 3 ? 1 : null,
        ativo: true,
        permissoes: appStore.perfis.find((role) => role.id === roleId).permissoes,
      };
      appStore.usuarios.push(user);
      temporaryUsers.push(user);
      const userToken = issueToken(user);
      const response = await request(app)
        .get('/api/admin/usuarios')
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.status).toBe(403);
    }

    const allowed = await request(app)
      .get('/api/admin/usuarios')
      .set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);
  });
});
