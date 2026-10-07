import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { PresenceBroadcaster } from './presence.broadcaster.js';
import { PresenceService } from './presence.service.js';
import { PresenceController } from './presence.controller.js';

@Module({
  imports: [PrismaModule, ScheduleModule],
  controllers: [PresenceController],
  providers: [PresenceBroadcaster, PresenceService],
  exports: [PresenceBroadcaster, PresenceService],
})
export class PresenceModule {}
