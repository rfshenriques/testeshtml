import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { QueueRegistry } from '../src/shared/queues/queue-registry.service';

describe('M0 foundations (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.get(QueueRegistry).obliterateAll();
    await app.close();
  });

  it('GET /health reports db, redis and every queue', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.redis).toBe('ok');
    expect(res.body.queues.map((q: any) => q.name)).toEqual(
      expect.arrayContaining(['discovery.tile', 'outreach.send', 'maintenance.purge']),
    );
    expect(res.body.killSwitch).toBe(false);
  });

  it('admin routes require the bearer token', async () => {
    await request(app.getHttpServer()).get('/admin/ops/overview').expect(401);
    await request(app.getHttpServer()).get('/admin/ops/overview').set('authorization', 'Bearer wrong').expect(401);
    const ok = await request(app.getHttpServer()).get('/admin/ops/overview').set('authorization', 'Bearer test-admin-token').expect(200);
    expect(ok.body.killSwitch).toBe(false);
  });

  it('kill switch pauses every queue and release resumes them', async () => {
    const auth = { authorization: 'Bearer test-admin-token' };
    await request(app.getHttpServer()).post('/admin/ops/kill-switch').set(auth).send({ engaged: true, reason: 'test' }).expect(201);
    let depths = (await request(app.getHttpServer()).get('/health')).body.queues;
    expect(depths.every((q: any) => q.paused)).toBe(true);
    await request(app.getHttpServer()).post('/admin/ops/kill-switch').set(auth).send({ engaged: false }).expect(201);
    depths = (await request(app.getHttpServer()).get('/health')).body.queues;
    expect(depths.every((q: any) => !q.paused)).toBe(true);
  });
});
