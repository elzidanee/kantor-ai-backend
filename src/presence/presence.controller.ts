import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PresenceService } from './presence.service.js';
import { PresenceBroadcaster } from './presence.broadcaster.js';

@Controller('office')
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly broadcaster: PresenceBroadcaster,
  ) {}

  @Sse('stream')
  async stream(): Promise<Observable<MessageEvent>> {
    const initialSnapshot = await this.presence.getInitialSnapshot();
    return this.broadcaster.getStream(initialSnapshot);
  }

  @Get('presences')
  getPresences() {
    return this.presence.getPresences();
  }

  @Post('toilet/:agentId')
  sendToToilet(
    @Param('agentId') agentId: string,
    @Query('duration') duration?: string,
  ) {
    const sec = duration ? parseInt(duration, 10) : 15;
    return this.presence.sendToToilet(agentId, sec);
  }
}
