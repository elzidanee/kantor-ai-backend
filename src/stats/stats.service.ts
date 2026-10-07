import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotaService } from '../quota/quota.service.js';

@Injectable()
export class StatsService {
  constructor(
    private readonly db: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  async getStats() {
    const startOfDay = this.quota.getStartOfDayWib();
    const quotaUsage = await this.quota.getTodayUsage();

    const [
      totalTasks,
      doneTasks,
      queuedTasks,
      runningTasks,
      reviewTasks,
      blockedTasks,
      failedTasks,
      todayRuns,
      todayAgg,
      agents,
      modelRuns,
    ] = await Promise.all([
      this.db.task.count(),
      this.db.task.count({ where: { status: 'DONE' } }),
      this.db.task.count({ where: { status: 'QUEUED' } }),
      this.db.task.count({ where: { status: 'RUNNING' } }),
      this.db.task.count({ where: { status: 'REVIEW' } }),
      this.db.task.count({ where: { status: 'BLOCKED' } }),
      this.db.task.count({ where: { status: 'FAILED' } }),
      this.db.taskRun.findMany({
        where: { createdAt: { gte: startOfDay } },
        select: {
          id: true,
          status: true,
          latencyMs: true,
          totalTokens: true,
          promptTokens: true,
          completionTokens: true,
          model: true,
          agentId: true,
        },
      }),
      this.db.taskRun.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
        _avg: {
          latencyMs: true,
        },
      }),
      this.db.agent.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          color: true,
        },
      }),
      this.db.taskRun.groupBy({
        by: ['model'],
        where: { createdAt: { gte: startOfDay } },
        _count: { _all: true },
        _sum: { totalTokens: true },
      }),
    ]);

    // Breakdown per agent
    const agentStats = agents.map((agent) => {
      const runsForAgent = todayRuns.filter((r) => r.agentId === agent.id);
      const totalTokens = runsForAgent.reduce((acc, r) => acc + (r.totalTokens || 0), 0);
      const totalLatency = runsForAgent.reduce((acc, r) => acc + (r.latencyMs || 0), 0);
      const avgLatencyMs = runsForAgent.length ? Math.round(totalLatency / runsForAgent.length) : 0;
      const successRuns = runsForAgent.filter((r) => r.status === 'SUCCESS').length;

      return {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        color: agent.color,
        runsCount: runsForAgent.length,
        totalTokens,
        avgLatencyMs,
        successRate: runsForAgent.length ? Math.round((successRuns / runsForAgent.length) * 100) : 100,
      };
    });

    // Breakdown per model
    const modelStats = modelRuns.map((m) => ({
      model: m.model,
      runsCount: m._count._all,
      totalTokens: m._sum.totalTokens || 0,
    }));

    return {
      today: {
        totalRuns: todayRuns.length,
        promptTokens: todayAgg._sum.promptTokens || 0,
        completionTokens: todayAgg._sum.completionTokens || 0,
        totalTokens: todayAgg._sum.totalTokens || 0,
        avgLatencyMs: Math.round(todayAgg._avg.latencyMs || 0),
        quota: quotaUsage,
      },
      tasks: {
        total: totalTasks,
        done: doneTasks,
        queued: queuedTasks,
        running: runningTasks,
        review: reviewTasks,
        blocked: blockedTasks,
        failed: failedTasks,
      },
      agents: agentStats,
      models: modelStats,
    };
  }
}
