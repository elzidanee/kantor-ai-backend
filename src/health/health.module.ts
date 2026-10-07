import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'office-tasks',
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
