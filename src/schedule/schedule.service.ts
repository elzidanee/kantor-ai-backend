import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateScheduleBlockDto,
  UpdateOfficeSettingsDto,
  UpdateScheduleBlockDto,
} from './schedule.dto.js';

export interface OfficeState {
  isOpen: boolean;
  status: 'OPEN' | 'BREAK' | 'CLOSED' | 'PAUSED' | 'OVERTIME';
  currentTime: string; // HH:mm
  currentDay: string; // senin..minggu
  timezone: string;
  isPaused: boolean;
  isOvertime: boolean;
  activeBlock: {
    id: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
  } | null;
  suggestedPresence: {
    status: 'WORKING' | 'IDLE' | 'STANDUP' | 'PRAYING' | 'RESTING' | 'OFFLINE';
    location: 'DESK' | 'STANDUP_AREA' | 'MUSHOLA' | 'LAPANGAN' | 'TOILET';
  };
  nextOpenTimeMs: number;
  delayMs: number;
  summary: string;
}

const DAY_MAP: Record<string, string> = {
  sunday: 'minggu',
  monday: 'senin',
  tuesday: 'selasa',
  wednesday: 'rabu',
  thursday: 'kamis',
  friday: 'jumat',
  saturday: 'sabtu',
};

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private readonly db: PrismaService) {}

  // ===================== SETTINGS =====================

  async getSettings() {
    let settings = await this.db.officeSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await this.db.officeSettings.create({
        data: {
          id: 'default',
          timezone: 'Asia/Jakarta',
          workDays: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
          workStart: '08:00',
          workEnd: '17:00',
          dailyRunLimit: 100,
          dailyTokenLimit: 200000,
          maxConcurrency: 3,
          isPaused: false,
          isOvertime: false,
        },
      });
    }

    return settings;
  }

  async updateSettings(dto: UpdateOfficeSettingsDto) {
    await this.getSettings(); // Pastikan default row sudah ada

    return this.db.officeSettings.update({
      where: { id: 'default' },
      data: {
        timezone: dto.timezone,
        workDays: dto.workDays?.map((d) => d.toLowerCase()),
        workStart: dto.workStart,
        workEnd: dto.workEnd,
        routerBaseUrl: dto.routerBaseUrl,
        defaultModel: dto.defaultModel,
        dailyRunLimit: dto.dailyRunLimit,
        dailyTokenLimit: dto.dailyTokenLimit,
        maxConcurrency: dto.maxConcurrency,
        isPaused: dto.isPaused,
        isOvertime: dto.isOvertime,
      },
    });
  }

  // ===================== SCHEDULE BLOCKS =====================

  getScheduleBlocks() {
    return this.db.scheduleBlock.findMany({
      orderBy: { startTime: 'asc' },
    });
  }

  createScheduleBlock(dto: CreateScheduleBlockDto) {
    return this.db.scheduleBlock.create({
      data: {
        name: dto.name,
        type: dto.type,
        startTime: dto.startTime,
        endTime: dto.endTime,
        agentId: dto.agentId,
      },
    });
  }

  async updateScheduleBlock(id: string, dto: UpdateScheduleBlockDto) {
    const existing = await this.db.scheduleBlock.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ScheduleBlock ${id} tidak ditemukan`);

    return this.db.scheduleBlock.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        startTime: dto.startTime,
        endTime: dto.endTime,
        agentId: dto.agentId,
      },
    });
  }

  async deleteScheduleBlock(id: string) {
    const existing = await this.db.scheduleBlock.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ScheduleBlock ${id} tidak ditemukan`);

    await this.db.scheduleBlock.delete({ where: { id } });
    return { success: true, message: `ScheduleBlock ${id} berhasil dihapus` };
  }

  async initDefaultScheduleBlocks() {
    const defaults = [
      { name: 'Apel pagi', type: 'STANDUP' as const, startTime: '08:00', endTime: '08:15' },
      { name: 'Sholat Dzuhur', type: 'PRAYER' as const, startTime: '12:00', endTime: '12:30' },
      { name: 'Makan siang', type: 'MEAL' as const, startTime: '12:30', endTime: '13:00' },
      { name: 'Sholat Ashar', type: 'PRAYER' as const, startTime: '15:15', endTime: '15:45' },
    ];

    for (const b of defaults) {
      const exists = await this.db.scheduleBlock.findFirst({
        where: { name: b.name },
      });
      if (!exists) {
        await this.db.scheduleBlock.create({
          data: {
            name: b.name,
            type: b.type,
            startTime: b.startTime,
            endTime: b.endTime,
          },
        });
      }
    }

    return this.getScheduleBlocks();
  }

  // ===================== KONTROL PAUSE / RESUME =====================

  async pauseOffice() {
    await this.updateSettings({ isPaused: true });
    this.logger.warn(`Kantor di-PAUSE secara manual`);
    return this.getOfficeState();
  }

  async resumeOffice() {
    await this.updateSettings({ isPaused: false });
    this.logger.log(`Kantor di-RESUME`);
    return this.getOfficeState();
  }

  async toggleOvertime(isOvertime = true) {
    await this.updateSettings({ isOvertime });
    this.logger.log(`Status lembur diubah ke: ${isOvertime}`);
    return this.getOfficeState();
  }

  // ===================== KALKULASI STATUS JADWAL KANTOR =====================

  async getOfficeState(overrideDate?: Date): Promise<OfficeState> {
    const settings = await this.getSettings();
    const blocks = await this.getScheduleBlocks();

    const now = overrideDate ?? new Date();
    const tz = settings.timezone || 'Asia/Jakarta';

    // Ekstrak waktu lokal berdasarkan timezone yang ditentukan
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);

    const enDay = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase();
    const idDay = DAY_MAP[enDay] || 'senin';
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

    const currentTimeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const currentMinutes = hour * 60 + minute;

    const workStartMinutes = toMinutes(settings.workStart);
    const workEndMinutes = toMinutes(settings.workEnd);

    // 1. Cek Pause Manual (Emergency Stop)
    if (settings.isPaused) {
      return {
        isOpen: false,
        status: 'PAUSED',
        currentTime: currentTimeStr,
        currentDay: idDay,
        timezone: tz,
        isPaused: true,
        isOvertime: settings.isOvertime,
        activeBlock: null,
        suggestedPresence: { status: 'IDLE', location: 'DESK' },
        nextOpenTimeMs: now.getTime() + 60_000,
        delayMs: 60_000,
        summary: 'Kantor sedang di-PAUSE manual oleh owner',
      };
    }

    // 2. Cek Lembur (Overtime)
    if (settings.isOvertime) {
      return {
        isOpen: true,
        status: 'OVERTIME',
        currentTime: currentTimeStr,
        currentDay: idDay,
        timezone: tz,
        isPaused: false,
        isOvertime: true,
        activeBlock: null,
        suggestedPresence: { status: 'WORKING', location: 'DESK' },
        nextOpenTimeMs: now.getTime(),
        delayMs: 0,
        summary: 'Kantor dalam mode LEMBUR (overtime)',
      };
    }

    // 3. Cek Hari Kerja
    const workDaysLower = settings.workDays.map((d) => d.toLowerCase());
    const isWorkDay = workDaysLower.includes(idDay);

    if (!isWorkDay) {
      const msUntilNextDay = (24 * 60 - currentMinutes + workStartMinutes) * 60_000;
      return {
        isOpen: false,
        status: 'CLOSED',
        currentTime: currentTimeStr,
        currentDay: idDay,
        timezone: tz,
        isPaused: false,
        isOvertime: false,
        activeBlock: null,
        suggestedPresence: { status: 'OFFLINE', location: 'DESK' },
        nextOpenTimeMs: now.getTime() + msUntilNextDay,
        delayMs: msUntilNextDay,
        summary: `Hari ini (${idDay}) bukan hari kerja. Kantor tutup.`,
      };
    }

    // 4. Cek Jam Masuk & Jam Pulang
    if (currentMinutes < workStartMinutes) {
      const diffMinutes = workStartMinutes - currentMinutes;
      const delayMs = diffMinutes * 60_000;
      return {
        isOpen: false,
        status: 'CLOSED',
        currentTime: currentTimeStr,
        currentDay: idDay,
        timezone: tz,
        isPaused: false,
        isOvertime: false,
        activeBlock: null,
        suggestedPresence: { status: 'OFFLINE', location: 'DESK' },
        nextOpenTimeMs: now.getTime() + delayMs,
        delayMs,
        summary: `Kantor belum buka. Masuk jam ${settings.workStart} (${diffMinutes} menit lagi)`,
      };
    }

    if (currentMinutes >= workEndMinutes) {
      const minutesUntilTomorrow = (24 * 60 - currentMinutes + workStartMinutes);
      const delayMs = minutesUntilTomorrow * 60_000;
      return {
        isOpen: false,
        status: 'CLOSED',
        currentTime: currentTimeStr,
        currentDay: idDay,
        timezone: tz,
        isPaused: false,
        isOvertime: false,
        activeBlock: null,
        suggestedPresence: { status: 'OFFLINE', location: 'DESK' },
        nextOpenTimeMs: now.getTime() + delayMs,
        delayMs,
        summary: `Kantor sudah tutup (${settings.workEnd}). Buka kembali besok jam ${settings.workStart}`,
      };
    }

    // 5. Cek Blok Jeda (Apel, Sholat, Makan, Istirahat)
    for (const b of blocks) {
      const bStart = toMinutes(b.startTime);
      const bEnd = toMinutes(b.endTime);

      if (currentMinutes >= bStart && currentMinutes < bEnd) {
        const remainingMinutes = bEnd - currentMinutes;
        const delayMs = remainingMinutes * 60_000;

        let suggestedStatus: OfficeState['suggestedPresence']['status'] = 'RESTING';
        let suggestedLocation: OfficeState['suggestedPresence']['location'] = 'LAPANGAN';

        if (b.type === 'PRAYER') {
          suggestedStatus = 'PRAYING';
          suggestedLocation = 'MUSHOLA';
        } else if (b.type === 'STANDUP') {
          suggestedStatus = 'STANDUP';
          suggestedLocation = 'STANDUP_AREA';
        } else if (b.type === 'MEAL' || b.type === 'BREAK') {
          suggestedStatus = 'RESTING';
          suggestedLocation = 'LAPANGAN';
        }

        return {
          isOpen: false,
          status: 'BREAK',
          currentTime: currentTimeStr,
          currentDay: idDay,
          timezone: tz,
          isPaused: false,
          isOvertime: false,
          activeBlock: {
            id: b.id,
            name: b.name,
            type: b.type,
            startTime: b.startTime,
            endTime: b.endTime,
          },
          suggestedPresence: {
            status: suggestedStatus,
            location: suggestedLocation,
          },
          nextOpenTimeMs: now.getTime() + delayMs,
          delayMs,
          summary: `Sedang jeda: ${b.name} (${b.startTime} - ${b.endTime}), selesai ${remainingMinutes} menit lagi`,
        };
      }
    }

    // 6. Jam Kerja Normal
    return {
      isOpen: true,
      status: 'OPEN',
      currentTime: currentTimeStr,
      currentDay: idDay,
      timezone: tz,
      isPaused: false,
      isOvertime: false,
      activeBlock: null,
      suggestedPresence: { status: 'IDLE', location: 'DESK' },
      nextOpenTimeMs: now.getTime(),
      delayMs: 0,
      summary: `Kantor buka (Jam kerja: ${settings.workStart} - ${settings.workEnd})`,
    };
  }

  // ===================== SCHEDULE GUARD HELPER UNTUK WORKER =====================

  async canAgentWork(): Promise<{
    canWork: boolean;
    state: OfficeState;
  }> {
    const state = await this.getOfficeState();
    return {
      canWork: state.isOpen,
      state,
    };
  }
}
