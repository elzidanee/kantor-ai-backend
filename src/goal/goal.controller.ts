import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GoalService } from './goal.service.js';
import { ClarifyGoalDto, CreateGoalDto } from './goal.interface.js';

@Controller()
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Post('office/goals')
  async createGoal(@Body() dto: CreateGoalDto) {
    return this.goalService.createGoal(dto);
  }

  @Get('office/goals')
  async getGoals() {
    return this.goalService.getGoals();
  }

  @Get('office/goals/:id')
  async getGoalById(@Param('id') id: string) {
    return this.goalService.getGoalById(id);
  }

  @Post('office/goals/:id/clarify')
  async clarifyGoal(@Param('id') id: string, @Body() dto: ClarifyGoalDto) {
    return this.goalService.clarifyGoal(id, dto.answer);
  }

  // Alias endpoints
  @Post('goals')
  async createGoalAlias(@Body() dto: CreateGoalDto) {
    return this.goalService.createGoal(dto);
  }

  @Get('goals')
  async getGoalsAlias() {
    return this.goalService.getGoals();
  }

  @Get('goals/:id')
  async getGoalByIdAlias(@Param('id') id: string) {
    return this.goalService.getGoalById(id);
  }

  @Post('goals/:id/clarify')
  async clarifyGoalAlias(@Param('id') id: string, @Body() dto: ClarifyGoalDto) {
    return this.goalService.clarifyGoal(id, dto.answer);
  }
}
