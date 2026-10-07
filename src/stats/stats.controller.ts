import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service.js';

@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('office/stats')
  async getOfficeStats() {
    return this.statsService.getStats();
  }

  // Alias endpoint GET /stats
  @Get('stats')
  async getStats() {
    return this.statsService.getStats();
  }
}
