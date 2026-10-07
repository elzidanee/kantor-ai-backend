import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Phase 1 - Agent & Task Lifecycle (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 25000);

  it('GET /office/agents/templates should return 7 standard agent templates', async () => {
    const res = await request(app.getHttpServer())
      .get('/office/agents/templates')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(7);
    const keys = res.body.map((t: any) => t.key);
    expect(keys).toContain('PROJECT_MANAGER');
    expect(keys).toContain('FRONTEND');
    expect(keys).toContain('BACKEND');
    expect(keys).toContain('QA');
  });

  it('POST /office/agents/init-default should initialize the default agent team', async () => {
    const res = await request(app.getHttpServer())
      .post('/office/agents/init-default')
      .expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(7);
    const pm = res.body.find((a: any) => a.name === 'Dewi');
    expect(pm).toBeDefined();
    expect(pm.role).toBe('Project Manager');
  });

  it('PUT /office/agents/:id should update agent configuration', async () => {
    const listRes = await request(app.getHttpServer()).get('/office/agents');
    const agent = listRes.body[0];

    const res = await request(app.getHttpServer())
      .put(`/office/agents/${agent.id}`)
      .send({ maxTokens: 999, temperature: 0.3 })
      .expect(200);

    expect(res.body.maxTokens).toBe(999);
    expect(res.body.temperature).toBe(0.3);
  });

  it('POST /office/tasks and task lifecycle (revise & approve)', async () => {
    const listRes = await request(app.getHttpServer()).get('/office/agents');
    const agent = listRes.body[0];

    // 1. Create Task
    const taskRes = await request(app.getHttpServer())
      .post('/office/tasks')
      .send({
        agentId: agent.id,
        title: 'Test Lifecycle Task',
        description: 'Verifikasi siklus hidup task di fase 1',
        acceptanceCriteria: ['Output valid', 'Terkirim ke worker'],
        needsReview: true,
        priority: 'HIGH',
      })
      .expect(201);

    const taskId = taskRes.body.id;
    expect(taskRes.body.status).toBe('QUEUED');
    expect(taskRes.body.needsReview).toBe(true);

    // 2. Revise Task
    const reviseRes = await request(app.getHttpServer())
      .post(`/office/tasks/${taskId}/revise`)
      .send({ feedback: 'Tolong perbaiki format kriteria' })
      .expect(201);

    expect(reviseRes.body.revisionCount).toBe(1);
    expect(reviseRes.body.revisionNotes).toBe('Tolong perbaiki format kriteria');
    expect(reviseRes.body.status).toBe('QUEUED');

    // 3. Approve Task
    const approveRes = await request(app.getHttpServer())
      .post(`/office/tasks/${taskId}/approve`)
      .expect(201);

    expect(approveRes.body.status).toBe('DONE');
    expect(approveRes.body.finishedAt).toBeDefined();
  });
});
