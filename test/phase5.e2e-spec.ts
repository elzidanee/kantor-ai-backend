import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { QuotaService } from '../src/quota/quota.service.js';
import { ActivityLogService } from '../src/activity/activity-log.service.js';

describe('Phase 5 - Quota Guard, Activity Logs & Office Stats (e2e)', () => {
  let app: INestApplication<App>;
  let quotaService: QuotaService;
  let activityLogService: ActivityLogService;

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

    quotaService = app.get(QuotaService);
    activityLogService = app.get(ActivityLogService);

    // Pastikan agent dan minimal 1 log ada
    await request(app.getHttpServer()).post('/office/agents/init-default');
    await activityLogService.log({
      eventType: 'SYSTEM_EVENT',
      description: 'Inisialisasi test phase 5',
    });
  });

  afterAll(async () => {
    await app.close();
  }, 25000);

  it('GET /office/logs should return paginated activity audit logs', async () => {
    const res = await request(app.getHttpServer())
      .get('/office/logs?limit=5')
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const first = res.body.items[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('timestamp');
    expect(first).toHaveProperty('eventType');
    expect(first).toHaveProperty('description');

    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /office/logs with eventType filter should only return matching items', async () => {
    await activityLogService.log({
      eventType: 'SPECIAL_FILTER_TEST',
      description: 'Log khusus filter',
    });

    const res = await request(app.getHttpServer())
      .get('/office/logs?eventType=SPECIAL_FILTER_TEST')
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body.items) {
      expect(item.eventType).toBe('SPECIAL_FILTER_TEST');
    }
  });

  it('QuotaService should validate daily token and run limits', async () => {
    const check = await quotaService.checkQuota();

    expect(check).toHaveProperty('allowed');
    expect(check).toHaveProperty('usage');
    expect(typeof check.usage.tokensToday).toBe('number');
    expect(typeof check.usage.tokenLimit).toBe('number');
    expect(typeof check.usage.runsToday).toBe('number');
    expect(typeof check.usage.runLimit).toBe('number');
    expect(check.usage.tokenLimit).toBeGreaterThan(0);
  });

  it('GET /office/stats should return comprehensive metrics, agent breakdown, and quota status', async () => {
    const res = await request(app.getHttpServer())
      .get('/office/stats')
      .expect(200);

    // 1. Periksa bagian ringkasan hari ini
    expect(res.body).toHaveProperty('today');
    expect(res.body.today).toHaveProperty('totalRuns');
    expect(res.body.today).toHaveProperty('totalTokens');
    expect(res.body.today).toHaveProperty('avgLatencyMs');
    expect(res.body.today).toHaveProperty('quota');

    // 2. Periksa ringkasan status tugas
    expect(res.body).toHaveProperty('tasks');
    expect(res.body.tasks).toHaveProperty('total');
    expect(res.body.tasks).toHaveProperty('done');
    expect(res.body.tasks).toHaveProperty('blocked');

    // 3. Periksa statistik per agent
    expect(res.body).toHaveProperty('agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents.length).toBeGreaterThanOrEqual(1);

    const firstAgent = res.body.agents[0];
    expect(firstAgent).toHaveProperty('agentId');
    expect(firstAgent).toHaveProperty('name');
    expect(firstAgent).toHaveProperty('role');
    expect(firstAgent).toHaveProperty('runsCount');
    expect(firstAgent).toHaveProperty('totalTokens');
    expect(firstAgent).toHaveProperty('successRate');

    // 4. Periksa statistik model
    expect(res.body).toHaveProperty('models');
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('Alias GET /stats and GET /logs should work identically', async () => {
    const [statsRes, logsRes] = await Promise.all([
      request(app.getHttpServer()).get('/stats').expect(200),
      request(app.getHttpServer()).get('/logs').expect(200),
    ]);

    expect(statsRes.body).toHaveProperty('today');
    expect(logsRes.body).toHaveProperty('items');
  });
});
