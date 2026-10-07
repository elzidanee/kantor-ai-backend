import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LlmModule } from '../llm/llm.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { OfficeService } from './office.service.js';
import { OfficeController } from './office.controller.js';
import { TaskProcessor } from './task.processor.js';

@Module({
  imports: [
    LlmModule,
    ScheduleModule,
    BullModule.registerQueue({
      name: 'office-tasks',
    }),
  ],
  controllers: [OfficeController],
  providers: [OfficeService, TaskProcessor],
  exports: [OfficeService],
})
export class OfficeModule {}