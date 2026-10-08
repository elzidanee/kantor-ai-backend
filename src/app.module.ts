import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LlmModule } from './llm/llm.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OfficeModule } from './office/office.module.js';
import { HealthModule } from './health/health.module.js';
import { ScheduleModule } from './schedule/schedule.module.js';
import { PresenceModule } from './presence/presence.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { QuotaModule } from './quota/quota.module.js';
import { StatsModule } from './stats/stats.module.js';
import { GoalModule } from './goal/goal.module.js';
import { LocalFilesModule } from './local-files/local-files.module.js';
import { AutomationModule } from './automation/automation.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('REDIS_URL') ||
          config.get<string>('REDIS_PRIVATE_URL') ||
          config.get<string>('REDISURL');

        if (redisUrl) {
          try {
            const parsed = new URL(redisUrl);
            return {
              connection: {
                host: parsed.hostname,
                port: Number(parsed.port || 6379),
                username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
                password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
                maxRetriesPerRequest: null,
              },
            };
          } catch {
            // fallback if URL parsing fails
          }
        }

        const host =
          config.get<string>('REDIS_HOST') ||
          config.get<string>('REDISHOST') ||
          'localhost';
        const port = Number(
          config.get<string | number>('REDIS_PORT') ||
          config.get<string | number>('REDISPORT') ||
          6379,
        );
        const password =
          config.get<string>('REDIS_PASSWORD') ||
          config.get<string>('REDISPASSWORD');
        const username =
          config.get<string>('REDIS_USER') ||
          config.get<string>('REDISUSER');

        return {
          connection: {
            host,
            port,
            ...(password ? { password } : {}),
            ...(username ? { username } : {}),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'kantor-ai-backend',
    }),
    LlmModule,
    PrismaModule,
    OfficeModule,
    HealthModule,
    ScheduleModule,
    PresenceModule,
    ActivityModule,
    QuotaModule,
    StatsModule,
    GoalModule,
    LocalFilesModule,
    AutomationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
