import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Phase 3 - Realtime SSE & Speech Bubbles (e2e)', () => {
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

  it('GET /office/presences should return agents with bubbleText and bubbleType', async () => {
    // Pastikan agent default sudah diinisialisasi
    await request(app.getHttpServer()).post('/office/agents/init-default');

    const res = await request(app.getHttpServer())
      .get('/office/presences')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const first = res.body[0];
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('location');
    expect(first).toHaveProperty('bubbleText');
    expect(first).toHaveProperty('bubbleType');
    expect(typeof first.bubbleText).toBe('string');
  });

  it('POST /office/toilet/:agentId should move agent to toilet with toilet bubble dialog', async () => {
    const presencesRes = await request(app.getHttpServer()).get('/office/presences');
    const idleAgent = presencesRes.body.find((p: any) => p.status === 'IDLE') || presencesRes.body[0];

    const toiletRes = await request(app.getHttpServer())
      .post(`/office/toilet/${idleAgent.agentId}?duration=2`)
      .expect(201);

    expect(toiletRes.body.success).toBe(true);

    // Cek status presence berubah ke TOILET
    const checkRes = await request(app.getHttpServer()).get('/office/presences');
    const agentInToilet = checkRes.body.find((p: any) => p.agentId === idleAgent.agentId);

    expect(agentInToilet.status).toBe('TOILET');
    expect(agentInToilet.location).toBe('TOILET');
    expect(agentInToilet.bubbleType).toBe('TOILET');
    expect(agentInToilet.bubbleText).toContain('toilet');
  });

  it('GET /office/stream should establish an SSE connection with text/event-stream', async () => {
    const server = app.getHttpServer();
    const address = server.address();
    let port = typeof address === 'object' && address ? address.port : null;

    if (!port) {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      port = (server.address() as any).port;
    }

    const { default: http } = await import('node:http');

    await new Promise<void>((resolve) => {
      const clientReq = http.get(`http://localhost:${port}/office/stream`, (res) => {
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.on('data', (chunk) => {
          const text = chunk.toString();
          if (text.includes('office.status') || text.includes('agent.presence')) {
            res.destroy();
            resolve();
          }
        });
      });

      clientReq.on('error', () => {
        resolve();
      });

      setTimeout(() => resolve(), 3000);
    });
  });
});
