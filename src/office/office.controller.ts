import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CreateAgentDto,
  CreateTaskDto,
  OfficeService,
  ReviseTaskDto,
  UpdateAgentDto,
} from './office.service.js';

@Controller('office')
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  // ===================== TEMPLATES & INIT =====================

  @Get('agents/templates')
  getTemplates() {
    return this.office.getTemplates();
  }

  @Post('agents/init-default')
  initDefaultAgents() {
    return this.office.initDefaultAgents();
  }

  // ===================== AGENTS =====================

  @Post('agents')
  createAgent(@Body() body: CreateAgentDto) {
    return this.office.createAgent(body);
  }

  @Get('agents')
  listAgents(@Query('includeInactive') includeInactive?: string) {
    return this.office.listAgents(includeInactive === 'true');
  }

  @Get('agents/:id')
  getAgent(@Param('id') id: string) {
    return this.office.getAgent(id);
  }

  @Put('agents/:id')
  updateAgent(@Param('id') id: string, @Body() body: UpdateAgentDto) {
    return this.office.updateAgent(id, body);
  }

  @Delete('agents/:id')
  deleteAgent(@Param('id') id: string) {
    return this.office.deleteAgent(id);
  }

  // ===================== TASKS =====================

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

  // ===================== APPROVE & REVISE =====================

  @Post('tasks/:id/approve')
  approveTask(@Param('id') id: string) {
    return this.office.approveTask(id);
  }

  @Post('tasks/:id/revise')
  reviseTask(@Param('id') id: string, @Body() body: ReviseTaskDto) {
    return this.office.reviseTask(id, body);
  }
}