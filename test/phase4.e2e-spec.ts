import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { validateGoalPlan } from '../src/goal/pm-planner.js';

describe('Phase 4 - Project Manager Goal Orchestration & Dependency Resolver (e2e)', () => {
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

    // Pastikan agent bawaan kantor diinisialisasi
    await request(app.getHttpServer()).post('/office/agents/init-default');
  });

  afterAll(async () => {
    await app.close();
  }, 25000);

  it('validateGoalPlan should reject cyclic dependencies and invalid plans', () => {
    // 1. Valid plan
    const validResult = validateGoalPlan([
      {
        key: 'T1',
        title: 'Buat API Endpoint',
        role: 'BACKEND',
        description: 'Buat endpoint CRUD',
        acceptance_criteria: ['Status 200', 'Validasi input'],
        depends_on: [],
      },
      {
        key: 'T2',
        title: 'Integrasi Frontend',
        role: 'FRONTEND',
        description: 'Tampilkan data dari API',
        acceptance_criteria: ['Tampilan rapi'],
        depends_on: ['T1'],
      },
    ]);
    expect(validResult.valid).toBe(true);

    // 2. Cyclic dependency (T1 -> T2 -> T1)
    const cyclicResult = validateGoalPlan([
      {
        key: 'T1',
        title: 'Task 1',
        role: 'BACKEND',
        description: 'Desc 1',
        acceptance_criteria: ['Crit 1'],
        depends_on: ['T2'],
      },
      {
        key: 'T2',
        title: 'Task 2',
        role: 'FRONTEND',
        description: 'Desc 2',
        acceptance_criteria: ['Crit 2'],
        depends_on: ['T1'],
      },
    ]);
    expect(cyclicResult.valid).toBe(false);
    expect(cyclicResult.error).toContain('siklus dependensi');

    // 3. Self dependency
    const selfResult = validateGoalPlan([
      {
        key: 'T1',
        title: 'Self task',
        role: 'BACKEND',
        description: 'Desc',
        acceptance_criteria: ['Crit'],
        depends_on: ['T1'],
      },
    ]);
    expect(selfResult.valid).toBe(false);

    // 4. Missing acceptance criteria
    const noCritResult = validateGoalPlan([
      {
        key: 'T1',
        title: 'Task no crit',
        role: 'BACKEND',
        description: 'Desc',
        acceptance_criteria: [],
        depends_on: [],
      },
    ]);
    expect(noCritResult.valid).toBe(false);
    expect(noCritResult.error).toContain('kriteria penerimaan');
  });

  it('POST /office/goals with clear prompt should decompose into tasks with dependencies', async () => {
    const res = await request(app.getHttpServer())
      .post('/office/goals')
      .send({
        text: 'Buat halaman pendaftaran webinar: T1 backend buat endpoint register, T2 frontend buat form register tergantung T1, T3 QA test pendaftaran tergantung T2.',
      })
      .expect(201);

    expect(res.body).toHaveProperty('goal');
    expect(res.body.goal).toHaveProperty('id');
    expect(res.body.goal.status).toBe('IN_PROGRESS');
    expect(Array.isArray(res.body.goal.tasks)).toBe(true);
    expect(res.body.goal.tasks.length).toBeGreaterThanOrEqual(1);

    const goalId = res.body.goal.id;

    // Cek detail goal via GET /office/goals/:id
    const detailRes = await request(app.getHttpServer())
      .get(`/office/goals/${goalId}`)
      .expect(200);

    expect(detailRes.body.id).toBe(goalId);
    expect(detailRes.body).toHaveProperty('progress');
    expect(detailRes.body.progress).toHaveProperty('total');
    expect(detailRes.body.progress).toHaveProperty('percent');
  }, 45000);

  it('Dependency Resolver should unblock downstream task when prerequisite completes', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);

    // Buat manual Goal langsung di DB agar cepat dan fokus ke logika Dependency Resolver
    const testGoal = await prisma.goal.create({
      data: {
        title: 'Goal Test Dependency Resolver',
        text: 'Target pengujian dependency resolver',
        status: 'IN_PROGRESS',
      },
    });

    const goalId = testGoal.id;
    const agentsRes = await request(app.getHttpServer()).get('/office/agents');
    const backendAgent = agentsRes.body.find((a: any) => a.role.includes('Backend')) || agentsRes.body[0];
    const frontendAgent = agentsRes.body.find((a: any) => a.role.includes('Frontend')) || agentsRes.body[1];

    // Buat task 1 (prerequisite)
    const t1 = await request(app.getHttpServer())
      .post('/office/tasks')
      .send({
        agentId: backendAgent.id,
        goalId,
        title: 'T1 - Buat API Auth',
        description: 'API login dan register',
        acceptanceCriteria: ['Endpoint /login aktif'],
      })
      .expect(201);

    // Buat task 2 yang dependsOn T1 (berstatus BLOCKED)
    const t2 = await prisma.task.create({
      data: {
        goalId,
        agentId: frontendAgent.id,
        title: 'T2 - Tampilan Form Login',
        description: 'Buat form yang memanggil API Auth',
        acceptanceCriteria: ['Form login responsif'],
        status: 'BLOCKED',
        dependsOn: [t1.body.id],
      },
    });

    expect(t2.status).toBe('BLOCKED');

    // Selesaikan T1 dengan approveTask
    await request(app.getHttpServer())
      .post(`/office/tasks/${t1.body.id}/approve`)
      .expect(201);

    // Beri sedikit jeda mikrodetik agar resolver selesai
    await new Promise((r) => setTimeout(r, 100));

    // Periksa bahwa T2 otomatis terbuka menjadi QUEUED
    const t2Updated = await prisma.task.findUnique({
      where: { id: t2.id },
    });

    expect(t2Updated?.status).toBe('QUEUED');
  });

  it('GET /office/goals should list goals with computed progress summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/office/goals')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const first = res.body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('progress');
    expect(typeof first.progress.total).toBe('number');
    expect(typeof first.progress.done).toBe('number');
    expect(typeof first.progress.percent).toBe('number');
  });
});
