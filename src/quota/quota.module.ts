import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { QuotaService } from './quota.service.js';

@Module({
  imports: [PrismaModule, ActivityModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
