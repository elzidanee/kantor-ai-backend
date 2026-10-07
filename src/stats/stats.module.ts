import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QuotaModule } from '../quota/quota.module.js';
import { StatsService } from './stats.service.js';
import { StatsController } from './stats.controller.js';

@Module({
  imports: [PrismaModule, QuotaModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
