import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AutomationService, RunAutomationDto } from './automation.service.js';

@Controller('automations')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('presets')
  getPresets() {
    return this.automationService.getPresets();
  }

  @Get('history')
  getHistory() {
    return this.automationService.getHistory();
  }

  @Get()
  getAutomations() {
    return this.automationService.getAutomations();
  }

  @Post('quick-run')
  quickRun(@Body() body: RunAutomationDto) {
    return this.automationService.runAutomation(body);
  }

  @Post()
  saveAutomation(@Body() body: any) {
    return this.automationService.saveAutomation(body);
  }

  @Post(':id/toggle-watcher')
  toggleWatcher(
    @Param('id') id: string,
    @Body() body?: { enable?: boolean },
  ) {
    return this.automationService.toggleWatcher(id, body?.enable);
  }

  @Delete(':id')
  deleteAutomation(@Param('id') id: string) {
    return this.automationService.deleteAutomation(id);
  }
}
