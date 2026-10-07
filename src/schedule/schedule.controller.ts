import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import {
  CreateScheduleBlockDto,
  UpdateOfficeSettingsDto,
  UpdateScheduleBlockDto,
} from './schedule.dto.js';

@Controller()
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  // ===================== SETTINGS =====================

  @Get('settings')
  getSettings() {
    return this.schedule.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: UpdateOfficeSettingsDto) {
    return this.schedule.updateSettings(body);
  }

  // ===================== SCHEDULE BLOCKS =====================

  @Get('schedule-blocks')
  getScheduleBlocks() {
    return this.schedule.getScheduleBlocks();
  }

  @Post('schedule-blocks')
  createScheduleBlock(@Body() body: CreateScheduleBlockDto) {
    return this.schedule.createScheduleBlock(body);
  }

  @Post('schedule-blocks/init-default')
  initDefaultScheduleBlocks() {
    return this.schedule.initDefaultScheduleBlocks();
  }

  @Put('schedule-blocks/:id')
  updateScheduleBlock(
    @Param('id') id: string,
    @Body() body: UpdateScheduleBlockDto,
  ) {
    return this.schedule.updateScheduleBlock(id, body);
  }

  @Delete('schedule-blocks/:id')
  deleteScheduleBlock(@Param('id') id: string) {
    return this.schedule.deleteScheduleBlock(id);
  }

  // ===================== OFFICE STATE & OPERATIONAL CONTROLS =====================

  @Get('office/state')
  getOfficeState() {
    return this.schedule.getOfficeState();
  }

  @Post('office/pause')
  pauseOffice() {
    return this.schedule.pauseOffice();
  }

  @Post('office/resume')
  resumeOffice() {
    return this.schedule.resumeOffice();
  }

  @Post('office/overtime')
  toggleOvertime(@Body('isOvertime') isOvertime?: boolean) {
    return this.schedule.toggleOvertime(isOvertime ?? true);
  }
}
