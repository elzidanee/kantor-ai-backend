import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  title?: string;
}

export class ClarifyGoalDto {
  @IsString()
  @IsNotEmpty()
  answer: string;
}

export type GoalTriageCategory =
  | 'SINGLE_TASK'
  | 'MULTI_TASK'
  | 'AMBIGUOUS'
  | 'STATUS_QUERY'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE';

export interface GoalTriageResult {
  category: GoalTriageCategory;
  summary: string;
  roles_needed: string[];
  missing_info: string[];
  risk: string;
  needs_owner_approval_before_start?: boolean;
  clarification_questions?: string[];
}

export interface PlanTaskItem {
  key: string;
  title: string;
  role: string;
  description: string;
  acceptance_criteria: string[];
  deliverable?: string;
  depends_on?: string[];
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface GoalPlanResult {
  goal_summary: string;
  assumptions: string[];
  tasks: PlanTaskItem[];
}
