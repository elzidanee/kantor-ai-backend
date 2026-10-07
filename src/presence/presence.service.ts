import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScheduleService } from '../schedule/schedule.service.js';
import { PresenceBroadcaster, SsePayload } from './presence.broadcaster.js';
import { generateBubbleDialog, BubbleType } from './bubble-dialogs.js';

export interface UpdatePresenceInput {
  status: 'WORKING' | 'IDLE' | 'STANDUP' | 'PRAYING' | 'RESTING' | 'TOILET' | 'OFFLINE';
  location: 'DESK' | 'STANDUP_AREA' | 'MUSHOLA' | 'TOILET' | 'LAPANGAN';
  currentTaskId?: string | null;
  bubbleText?: string;
  bubbleType?: BubbleType;
  taskTitle?: string;
  blockName?: string;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly broadcaster: PresenceBroadcaster,
  ) {}

  async getPresences() {
    return this.db.agentPresence.findMany({
      include: { agent: true },
      orderBy: { agent: { deskIndex: 'asc' } },
    });
  }

  async updatePresence(agentId: string, input: UpdatePresenceInput) {
    const agent = await this.db.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} tidak ditemukan`);

    // 1. Tentukan bubble dialog otomatis jika tidak disediakan
    let bubbleText = input.bubbleText;
    let bubbleType = input.bubbleType;

    if (!bubbleText) {
      const generated = generateBubbleDialog(input.status, {
        taskTitle: input.taskTitle,
        blockName: input.blockName,
      });
      bubbleText = generated.bubbleText;
      bubbleType = generated.bubbleType;
    }

    // 2. Simpan update presence ke database
    const presence = await this.db.agentPresence.upsert({
      where: { agentId },
      create: {
        agentId,
        status: input.status,
        location: input.location,
        currentTaskId: input.currentTaskId ?? null,
        bubbleText,
        bubbleType,
      },
      update: {
        status: input.status,
        location: input.location,
        currentTaskId: input.currentTaskId !== undefined ? input.currentTaskId : undefined,
        bubbleText,
        bubbleType,
      },
      include: { agent: true },
    });

    // 3. Broadcast event agent.presence ke seluruh client SSE
    this.broadcaster.broadcast('agent.presence', {
      agentId: presence.agentId,
      agentName: presence.agent.name,
      role: presence.agent.role,
      color: presence.agent.color,
      deskIndex: presence.agent.deskIndex,
      status: presence.status,
      location: presence.location,
      currentTaskId: presence.currentTaskId,
      bubbleText: presence.bubbleText,
      bubbleType: presence.bubbleType,
      updatedAt: presence.updatedAt,
    });

    return presence;
  }

  // ===================== KUNJUNGAN TOILET KOSMETIK =====================

  async sendToToilet(agentId: string, durationSeconds = 15) {
    const current = await this.db.agentPresence.findUnique({
      where: { agentId },
      include: { agent: true },
    });

    if (!current) throw new NotFoundException(`Agent ${agentId} tidak ditemukan`);
    if (current.status === 'WORKING') {
      throw new BadRequestException(
        `Agent ${current.agent.name} sedang bekerja menyelesaikan tugas, tidak boleh dipotong ke toilet.`,
      );
    }

    // Pindahkan ke TOILET
    await this.updatePresence(agentId, {
      status: 'TOILET',
      location: 'TOILET',
      bubbleText: 'Izin ke toilet bentar ya...',
      bubbleType: 'TOILET',
    });

    this.logger.log(`[Cosmetic] Agent ${current.agent.name} pergi ke toilet (${durationSeconds}s)`);

    // Jadwalkan otomatis kembali ke meja (DESK, IDLE) setelah durasi selesai
    setTimeout(async () => {
      try {
        const check = await this.db.agentPresence.findUnique({ where: { agentId } });
        // Hanya kembalikan jika masih di toilet (tidak terinterupsi tugas baru)
        if (check?.status === 'TOILET') {
          await this.updatePresence(agentId, {
            status: 'IDLE',
            location: 'DESK',
            bubbleText: 'Segar kembali, siap bekerja lagi!',
            bubbleType: 'IDLE',
          });
          this.logger.log(`[Cosmetic] Agent ${current.agent.name} kembali dari toilet ke meja`);
        }
      } catch (err) {
        this.logger.error(`Gagal mengembalikan agent dari toilet: ${err}`);
      }
    }, durationSeconds * 1000);

    return {
      success: true,
      message: `Agent ${current.agent.name} sedang ke toilet selama ${durationSeconds} detik`,
    };
  }

  // ===================== BROADCAST EVENT HELPERS =====================

  broadcastTaskUpdated(task: {
    id: string;
    title: string;
    status: string;
    agentId: string;
    priority?: string;
  }) {
    this.broadcaster.broadcast('task.updated', task);
  }

  broadcastRunFinished(run: {
    taskId: string;
    agentId: string;
    model: string;
    totalTokens: number | null;
    latencyMs: number | null;
    status: string;
  }) {
    this.broadcaster.broadcast('run.finished', run);
  }

  broadcastOfficeStatus(state: any) {
    this.broadcaster.broadcast('office.status', state);
  }

  // ===================== INITIAL SNAPSHOT PROVIDER =====================

  async getInitialSnapshot(): Promise<SsePayload[]> {
    const officeState = await this.schedule.getOfficeState();
    const presences = await this.getPresences();

    const snapshot: SsePayload[] = [
      {
        type: 'office.status',
        data: officeState,
      },
    ];

    for (const p of presences) {
      snapshot.push({
        type: 'agent.presence',
        data: {
          agentId: p.agentId,
          agentName: p.agent.name,
          role: p.agent.role,
          color: p.agent.color,
          deskIndex: p.agent.deskIndex,
          status: p.status,
          location: p.location,
          currentTaskId: p.currentTaskId,
          bubbleText: p.bubbleText,
          bubbleType: p.bubbleType,
          updatedAt: p.updatedAt,
        },
      });
    }

    return snapshot;
  }
}
