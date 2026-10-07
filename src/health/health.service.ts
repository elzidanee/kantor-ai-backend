import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {}

  async check() {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';
    let queueJobCounts = null;

    // 1. Check PostgreSQL via Prisma
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (err: any) {
      this.logger.error(`Database health check failed: ${err.message}`);
      dbStatus = `error: ${err.message}`;
    }

    // 2. Check Redis / BullMQ
    try {
      queueJobCounts = await this.taskQueue.getJobCounts();
      redisStatus = 'connected';
    } catch (err: any) {
      this.logger.error(`Redis/Queue health check failed: ${err.message}`);
      redisStatus = `error: ${err.message}`;
    }

    // 3. Check 9Router configuration
    const routerBaseUrl = this.config.get<string>('ROUTER_BASE_URL');
    const routerApiKey = this.config.get<string>('ROUTER_API_KEY');
    const routerModel = this.config.get<string>('ROUTER_MODEL');
    const isRouterConfigured = Boolean(routerBaseUrl && routerApiKey && routerModel);

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected' && isRouterConfigured;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        queue: {
          name: 'office-tasks',
          counts: queueJobCounts,
        },
        router: {
          configured: isRouterConfigured,
          baseUrl: routerBaseUrl,
          model: routerModel,
        },
      },
    };
  }
}
