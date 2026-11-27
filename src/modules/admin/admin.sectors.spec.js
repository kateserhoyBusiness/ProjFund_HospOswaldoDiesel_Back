import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../core/memory.js';

const sector = appStore.setores.find((item) => item.id === 6);
const originalActive = sector.ativo;

afterEach(() => {
  sector.ativo = originalActive;
});

describe('admin sector management', () => {
  it('updates sector activity and keeps inactive sectors in the admin list', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@fundacao.com', senha: 'super123' });
    expect(login.status).toBe(200);
    const authorization = `Bearer ${login.body.token}`;

    const deactivate = await request(app)
      .patch(`/api/admin/setores/${sector.id}`)
      .set('Authorization', authorization)
      .send({ ativo: false });

    expect(deactivate.status).toBe(200);
    expect(deactivate.body.ativo).toBe(false);

    const [adminSectors, publicSectors] = await Promise.all([
      request(app).get('/api/admin/setores').set('Authorization', authorization),
      request(app).get('/api/setores'),
    ]);

    expect(adminSectors.status).toBe(200);
    expect(adminSectors.body.find((item) => item.id === sector.id).ativo).toBe(false);
    expect(publicSectors.body.some((item) => item.id === sector.id)).toBe(false);
  });
});
