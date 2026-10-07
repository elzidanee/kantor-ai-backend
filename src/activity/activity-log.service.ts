import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateActivityLogInput {
  eventType: string; // AGENT_PRESENCE, TASK_LIFECYCLE, GOAL_LIFECYCLE, QUOTA_EXCEEDED, SCHEDULE_CHANGE, REVIEW_ACTION
  agentId?: string | null;
  taskId?: string | null;
  goalId?: string | null;
  description: string;
  metadata?: any;
}

export interface GetActivityLogsQuery {
  page?: number;
  limit?: number;
  eventType?: string;
  agentId?: string;
  taskId?: string;
  goalId?: string;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly db: PrismaService) {}

  async log(data: CreateActivityLogInput) {
    try {
      return await this.db.activityLog.create({
        data: {
          eventType: data.eventType,
          agentId: data.agentId ?? null,
          taskId: data.taskId ?? null,
          goalId: data.goalId ?? null,
          description: data.description,
          metadata: data.metadata ?? undefined,
        },
      });
    } catch (err: any) {
      this.logger.error(`Gagal mencatat activity log: ${err.message}`);
      return null;
    }
  }

  async getLogs(query: GetActivityLogsQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.eventType) where.eventType = query.eventType;
    if (query.agentId) where.agentId = query.agentId;
    if (query.taskId) where.taskId = query.taskId;
    if (query.goalId) where.goalId = query.goalId;

    const [total, items] = await Promise.all([
      this.db.activityLog.count({ where }),
      this.db.activityLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
