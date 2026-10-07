import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';

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

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'NORMAL' | 'HIGH';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dependsOn?: string[];
}

@Injectable()
export class OfficeService {
  constructor(
    private readonly db: PrismaService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {}

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
      },
    });

    // Inisialisasi presence agen di meja (IDLE)
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

  listAgents() {
    return this.db.agent.findMany({
      include: { presence: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTask(dto: CreateTaskDto) {
    // Validasi agen
    const agent = await this.db.agent.findUnique({ where: { id: dto.agentId } });
    if (!agent) throw new NotFoundException(`Agent ${dto.agentId} tidak ditemukan`);

    // 1. Simpan task dengan status QUEUED
    const task = await this.db.task.create({
      data: {
        agentId: dto.agentId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'NORMAL',
        dependsOn: dto.dependsOn ?? [],
        status: 'QUEUED',
      },
      include: { agent: true },
    });

    // 2. Masukkan ke antrean BullMQ (retry up to 3x with backoff)
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

    // 3. Response cepat dan non-blocking
    return task;
  }

  async getTask(id: string) {
    const task = await this.db.task.findUnique({
      where: { id },
      include: {
        agent: true,
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
}