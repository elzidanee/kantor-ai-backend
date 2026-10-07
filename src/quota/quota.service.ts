import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityLogService } from '../activity/activity-log.service.js';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  usage: {
    tokensToday: number;
    tokenLimit: number;
    runsToday: number;
    runLimit: number;
    tokenPercent: number;
    runPercent: number;
  };
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Mengembalikan Date awal hari (00:00:00 WIB) dalam format Date UTC.
   */
  getStartOfDayWib(): Date {
    const now = new Date();
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const wibDate = new Date(now.getTime() + wibOffsetMs);
    const year = wibDate.getUTCFullYear();
    const month = wibDate.getUTCMonth();
    const day = wibDate.getUTCDate();

    return new Date(Date.UTC(year, month, day, 0, 0, 0) - wibOffsetMs);
  }

  async getTodayUsage() {
    const startOfDay = this.getStartOfDayWib();

    const [settings, runsToday, tokenAgg] = await Promise.all([
      this.db.officeSettings.findUnique({ where: { id: 'default' } }),
      this.db.taskRun.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      this.db.taskRun.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: { totalTokens: true },
      }),
    ]);

    const tokenLimit = 999_999_999; // Unlimited token quota
    const runLimit = 999_999;       // Unlimited run quota
    const tokensToday = tokenAgg._sum.totalTokens ?? 0;

    const tokenPercent = Math.min(100, Math.round((tokensToday / tokenLimit) * 100));
    const runPercent = Math.min(100, Math.round((runsToday / runLimit) * 100));

    return {
      tokensToday,
      tokenLimit,
      runsToday,
      runLimit,
      tokenPercent,
      runPercent,
    };
  }

  async checkQuota(): Promise<QuotaCheckResult> {
    const usage = await this.getTodayUsage();
    // Kuota Tak Terbatas (Unlimited): Selalu diizinkan (allowed: true)
    return { allowed: true, usage };
  }
}
