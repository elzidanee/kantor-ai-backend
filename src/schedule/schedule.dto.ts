import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateOfficeSettingsDto {
  @IsString()
  @IsOptional()
  timezone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  workDays?: string[];

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'workStart harus dalam format HH:mm (contoh: 08:00)',
  })
  @IsOptional()
  workStart?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'workEnd harus dalam format HH:mm (contoh: 17:00)',
  })
  @IsOptional()
  workEnd?: string;

  @IsString()
  @IsOptional()
  routerBaseUrl?: string;

  @IsString()
  @IsOptional()
  defaultModel?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  dailyRunLimit?: number;

  @IsInt()
  @Min(1000)
  @IsOptional()
  dailyTokenLimit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxConcurrency?: number;

  @IsBoolean()
  @IsOptional()
  isPaused?: boolean;

  @IsBoolean()
  @IsOptional()
  isOvertime?: boolean;
}

export class CreateScheduleBlockDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['STANDUP', 'PRAYER', 'MEAL', 'BREAK', 'OTHER'])
  type!: 'STANDUP' | 'PRAYER' | 'MEAL' | 'BREAK' | 'OTHER';

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime harus dalam format HH:mm (contoh: 12:00)',
  })
  startTime!: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime harus dalam format HH:mm (contoh: 12:30)',
  })
  endTime!: string;

  @IsString()
  @IsOptional()
  agentId?: string;
}

export class UpdateScheduleBlockDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsIn(['STANDUP', 'PRAYER', 'MEAL', 'BREAK', 'OTHER'])
  @IsOptional()
  type?: 'STANDUP' | 'PRAYER' | 'MEAL' | 'BREAK' | 'OTHER';

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime harus dalam format HH:mm (contoh: 12:00)',
  })
  @IsOptional()
  startTime?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime harus dalam format HH:mm (contoh: 12:30)',
  })
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  agentId?: string;
}
