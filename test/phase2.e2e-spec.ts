import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Phase 2 - Schedule & Office Controls (e2e)', () => {
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

  it('GET /settings should return default office settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings')
      .expect(200);

    expect(res.body).toHaveProperty('timezone', 'Asia/Jakarta');
    expect(res.body).toHaveProperty('workStart', '08:00');
    expect(res.body).toHaveProperty('workEnd', '17:00');
    expect(Array.isArray(res.body.workDays)).toBe(true);
  });

  it('PUT /settings should update settings', async () => {
    const res = await request(app.getHttpServer())
      .put('/settings')
      .send({
        workStart: '08:30',
        workEnd: '17:30',
      })
      .expect(200);

    expect(res.body.workStart).toBe('08:30');
    expect(res.body.workEnd).toBe('17:30');

    // Kembalikan ke 08:00 & 17:00
    await request(app.getHttpServer())
      .put('/settings')
      .send({ workStart: '08:00', workEnd: '17:00' });
  });

  it('POST /schedule-blocks/init-default should create 4 default breaks', async () => {
    const res = await request(app.getHttpServer())
      .post('/schedule-blocks/init-default')
      .expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    const names = res.body.map((b: any) => b.name);
    expect(names).toContain('Apel pagi');
    expect(names).toContain('Sholat Dzuhur');
    expect(names).toContain('Makan siang');
    expect(names).toContain('Sholat Ashar');
  });

  it('POST & DELETE /schedule-blocks should manage custom break', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/schedule-blocks')
      .send({
        name: 'Kopi Sore',
        type: 'BREAK',
        startTime: '16:00',
        endTime: '16:15',
      })
      .expect(201);

    const blockId = createRes.body.id;
    expect(createRes.body.name).toBe('Kopi Sore');

    const deleteRes = await request(app.getHttpServer())
      .delete(`/schedule-blocks/${blockId}`)
      .expect(200);

    expect(deleteRes.body.success).toBe(true);
  });

  it('GET /office/state should return calculated office status', async () => {
    const res = await request(app.getHttpServer())
      .get('/office/state')
      .expect(200);

    expect(res.body).toHaveProperty('isOpen');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('currentTime');
    expect(res.body).toHaveProperty('currentDay');
    expect(res.body).toHaveProperty('timezone', 'Asia/Jakarta');
    expect(res.body).toHaveProperty('suggestedPresence');
    expect(res.body).toHaveProperty('summary');
  });

  it('POST /office/pause and /office/resume should toggle office pause status', async () => {
    // 1. Pause
    const pauseRes = await request(app.getHttpServer())
      .post('/office/pause')
      .expect(201);

    expect(pauseRes.body.isPaused).toBe(true);
    expect(pauseRes.body.status).toBe('PAUSED');
    expect(pauseRes.body.isOpen).toBe(false);

    // 2. Resume
    const resumeRes = await request(app.getHttpServer())
      .post('/office/resume')
      .expect(201);

    expect(resumeRes.body.isPaused).toBe(false);
  });

  it('POST /office/overtime should toggle overtime mode', async () => {
    const overtimeRes = await request(app.getHttpServer())
      .post('/office/overtime')
      .send({ isOvertime: true })
      .expect(201);

    expect(overtimeRes.body.isOvertime).toBe(true);
    expect(overtimeRes.body.status).toBe('OVERTIME');
    expect(overtimeRes.body.isOpen).toBe(true);

    // Matikan overtime kembali
    await request(app.getHttpServer())
      .post('/office/overtime')
      .send({ isOvertime: false });
  });
});
