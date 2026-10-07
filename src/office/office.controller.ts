import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateAgentDto, CreateTaskDto, OfficeService } from './office.service.js';

@Controller('office')
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  @Post('agents')
  createAgent(@Body() body: CreateAgentDto) {
    return this.office.createAgent(body);
  }

  @Get('agents')
  listAgents() {
    return this.office.listAgents();
  }

  @Get('agents/:id')
  getAgent(@Param('id') id: string) {
    return this.office.getAgent(id);
  }

  @Post('tasks')
  createTask(@Body() body: CreateTaskDto) {
    return this.office.createTask(body);
  }

  @Get('tasks')
  listTasks() {
    return this.office.listTasks();
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.office.getTask(id);
  }

  @Get('tasks/:id/runs')
  getTaskRuns(@Param('id') id: string) {
    return this.office.getTaskRuns(id);
  }
}