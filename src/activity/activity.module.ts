import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActivityLogService } from './activity-log.service.js';
import { ActivityController } from './activity.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [ActivityController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityModule {}
