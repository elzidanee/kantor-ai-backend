import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LlmModule } from '../llm/llm.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { QuotaModule } from '../quota/quota.module.js';
import { GoalModule } from '../goal/goal.module.js';
import { LocalFilesModule } from '../local-files/local-files.module.js';
import { OfficeService } from './office.service.js';
import { OfficeController } from './office.controller.js';
import { TaskProcessor } from './task.processor.js';

@Module({
  imports: [
    LlmModule,
    ScheduleModule,
    PresenceModule,
    ActivityModule,
    QuotaModule,
    GoalModule,
    LocalFilesModule,
    BullModule.registerQueue({
      name: 'office-tasks',
    }),
  ],
  controllers: [OfficeController],
  providers: [OfficeService, TaskProcessor],
  exports: [OfficeService],
})
export class OfficeModule {}