import { Controller, Get, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service.js';

@Controller()
export class ActivityController {
  constructor(private readonly activityService: ActivityLogService) {}

  @Get('office/logs')
  async getOfficeLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('eventType') eventType?: string,
    @Query('agentId') agentId?: string,
    @Query('taskId') taskId?: string,
    @Query('goalId') goalId?: string,
  ) {
    return this.activityService.getLogs({
      page,
      limit,
      eventType,
      agentId,
      taskId,
      goalId,
    });
  }

  // Alias endpoint GET /logs
  @Get('logs')
  async getLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('eventType') eventType?: string,
    @Query('agentId') agentId?: string,
    @Query('taskId') taskId?: string,
    @Query('goalId') goalId?: string,
  ) {
    return this.activityService.getLogs({
      page,
      limit,
      eventType,
      agentId,
      taskId,
      goalId,
    });
  }
}
