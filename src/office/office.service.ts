import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateAgentDto,
  UpdateAgentDto,
  CreateTaskDto,
  ReviseTaskDto,
} from './dto/office.dto.js';
import { AGENT_TEMPLATES, AgentTemplate } from './agent-templates.js';

export { CreateAgentDto, UpdateAgentDto, CreateTaskDto, ReviseTaskDto };

@Injectable()
export class OfficeService {
  constructor(
    private readonly db: PrismaService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {}

  // ===================== AGENT TEMPLATES & DEFAULT TEAM =====================

  getTemplates(): AgentTemplate[] {
    return AGENT_TEMPLATES;
  }

  async initDefaultAgents() {
    const created = [];
    for (const t of AGENT_TEMPLATES) {
      // Periksa apakah agent dengan nama/role ini sudah ada
      let agent = await this.db.agent.findFirst({
        where: { name: t.name },
      });

      if (!agent) {
        agent = await this.db.agent.create({
          data: {
            name: t.name,
            role: t.role,
            jobdesk: t.jobdesk,
            systemPrompt: t.systemPrompt,
            model: t.model,
            temperature: t.temperature ?? 0.7,
            maxTokens: t.maxTokens ?? 800,
            color: t.color,
            deskIndex: t.deskIndex,
            active: true,
          },
        });

        // Inisialisasi presence agent di meja
        await this.db.agentPresence.upsert({
          where: { agentId: agent.id },
          create: {
            agentId: agent.id,
            status: 'IDLE',
            location: 'DESK',
          },
          update: {},
        });
      }
      created.push(agent);
    }
    return this.listAgents();
  }

  // ===================== AGENT CRUD =====================

  async createAgent(dto: CreateAgentDto) {
    const agent = await this.db.agent.create({
      data: {
        name: dto.name,
        role: dto.role,
        jobdesk: dto.jobdesk,
        systemPrompt: dto.systemPrompt,
        model: dto.model,
        temperature: dto.temperature ?? 0.7,
        maxTokens: dto.maxTokens ?? 800,
        color: dto.color ?? '#3B82F6',
        deskIndex: dto.deskIndex ?? 0,
        active: true,
      },
    });

    // Inisialisasi presence agent di meja (IDLE)
    await this.db.agentPresence.create({
      data: {
        agentId: agent.id,
        status: 'IDLE',
        location: 'DESK',
      },
    });

    return this.getAgent(agent.id);
  }

  async getAgent(id: string) {
    const agent = await this.db.agent.findUnique({
      where: { id },
      include: {
        presence: true,
        _count: { select: { tasks: true } },
      },
    });
    if (!agent) throw new NotFoundException(`Agent ${id} tidak ditemukan`);
    return agent;
  }

  listAgents(includeInactive = false) {
    return this.db.agent.findMany({
      where: includeInactive ? undefined : { active: true },
      include: { presence: true },
      orderBy: { deskIndex: 'asc' },
    });
  }

  async updateAgent(id: string, dto: UpdateAgentDto) {
    await this.getAgent(id); // Pastikan ada

    return this.db.agent.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        jobdesk: dto.jobdesk,
        systemPrompt: dto.systemPrompt,
        model: dto.model,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        color: dto.color,
        deskIndex: dto.deskIndex,
        active: dto.active,
      },
      include: { presence: true },
    });
  }

  async deleteAgent(id: string) {
    await this.getAgent(id);

    // Soft delete: set active = false dan status presence = OFFLINE
    await this.db.agent.update({
      where: { id },
      data: { active: false },
    });

    await this.db.agentPresence.update({
      where: { agentId: id },
      data: { status: 'OFFLINE' },
    });

    return { success: true, message: `Agent ${id} berhasil dinonaktifkan` };
  }

  // ===================== TASK MANAGEMENT =====================

  async createTask(dto: CreateTaskDto) {
    const agent = await this.db.agent.findUnique({ where: { id: dto.agentId } });
    if (!agent) throw new NotFoundException(`Agent ${dto.agentId} tidak ditemukan`);
    if (!agent.active) throw new BadRequestException(`Agent ${dto.agentId} sedang tidak aktif`);

    // 1. Simpan task dengan status QUEUED
    const task = await this.db.task.create({
      data: {
        agentId: dto.agentId,
        title: dto.title,
        description: dto.description,
        acceptanceCriteria: dto.acceptanceCriteria ?? [],
        priority: dto.priority ?? 'NORMAL',
        dependsOn: dto.dependsOn ?? [],
        needsReview: dto.needsReview ?? false,
        status: 'QUEUED',
      },
      include: { agent: true },
    });

    // 2. Masukkan ke antrean BullMQ (retry up to 3x dengan backoff)
    await this.taskQueue.add(
      'process-task',
      { taskId: task.id },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    return task;
  }

  async getTask(id: string) {
    const task = await this.db.task.findUnique({
      where: { id },
      include: {
        agent: true,
        goal: true,
        runs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) throw new NotFoundException(`Task ${id} tidak ditemukan`);
    return task;
  }

  listTasks() {
    return this.db.task.findMany({
      include: {
        agent: true,
        goal: true,
        runs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTaskRuns(taskId: string) {
    return this.db.taskRun.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===================== REVIEW & REVISION FLOW (FR-T7) =====================

  async approveTask(id: string) {
    const task = await this.getTask(id);

    if (task.status === 'DONE') {
      return task; // Sudah selesai
    }

    const updated = await this.db.task.update({
      where: { id },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
      },
      include: { agent: true },
    });

    return updated;
  }

  async reviseTask(id: string, dto: ReviseTaskDto) {
    const task = await this.getTask(id);

    // Batasan PRD & logicagent.md: Maksimal 2 putaran revisi
    if (task.revisionCount >= 2) {
      throw new BadRequestException(
        `Batas maksimal 2 putaran revisi telah tercapai untuk task ${id}. Silakan buat task baru atau eskalasi ke Owner.`,
      );
    }

    const nextRevisionCount = task.revisionCount + 1;

    // Update status task kembali ke QUEUED dengan catatan revisi
    const updated = await this.db.task.update({
      where: { id },
      data: {
        status: 'QUEUED',
        revisionCount: nextRevisionCount,
        revisionNotes: dto.feedback,
        finishedAt: null,
      },
      include: { agent: true },
    });

    // Masukkan kembali ke antrean BullMQ
    await this.taskQueue.add(
      'process-task',
      { taskId: task.id },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    return updated;
  }
}