import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { GoalService } from './goal.service.js';
import { GoalController } from './goal.controller.js';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    PresenceModule,
    ActivityModule,
    BullModule.registerQueue({
      name: 'office-tasks',
    }),
  ],
  controllers: [GoalController],
  providers: [GoalService],
  exports: [GoalService],
})
export class GoalModule {}
