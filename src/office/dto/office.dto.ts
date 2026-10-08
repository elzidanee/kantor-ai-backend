import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsString()
  @IsNotEmpty()
  jobdesk!: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxTokens?: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @IsOptional()
  deskIndex?: number;
}

export class UpdateAgentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  jobdesk?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxTokens?: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @IsOptional()
  deskIndex?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsString()
  @IsOptional()
  goalId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  acceptanceCriteria?: string[];

  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'NORMAL' | 'HIGH';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dependsOn?: string[];

  @IsBoolean()
  @IsOptional()
  needsReview?: boolean;
}

export class ReviseTaskDto {
  @IsString()
  @IsNotEmpty()
  feedback!: string;
}

export class ClarifyTaskDto {
  @IsString()
  @IsNotEmpty()
  answer!: string;
}
