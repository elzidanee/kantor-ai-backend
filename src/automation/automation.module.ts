import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AutomationService } from './automation.service.js';
import { AutomationController } from './automation.controller.js';
import { LocalFilesModule } from '../local-files/local-files.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { ActivityModule } from '../activity/activity.module.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'office-tasks',
    }),
    LocalFilesModule,
    PrismaModule,
    PresenceModule,
    ActivityModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
