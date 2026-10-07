import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';

type Envelope = {
  status: 'DONE' | 'NEEDS_INFO';
  result: string;
  assumptions: string[];
  questions: string[];
};

function parseEnvelope(text: string): Envelope {
  try {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1 || e <= s) throw new Error('No JSON object found');
    const j = JSON.parse(text.slice(s, e + 1));
    return {
      status: j.status === 'NEEDS_INFO' ? 'NEEDS_INFO' : 'DONE',
      result: String(j.result ?? ''),
      assumptions: Array.isArray(j.assumptions) ? j.assumptions.map(String) : [],
      questions: Array.isArray(j.questions) ? j.questions.map(String) : [],
    };
  } catch {
    return {
      status: 'DONE',
      result: text.trim(),
      assumptions: ['Format balasan tidak sesuai JSON envelope, teks mentah disimpan'],
      questions: [],
    };
  }
}

@Processor('office-tasks', { concurrency: 3 })
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    private readonly db: PrismaService,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<any> {
    const { taskId } = job.data;
    this.logger.log(`Memproses task ${taskId} (Job ID: ${job.id})`);

    const task = await this.db.task.findUnique({
      where: { id: taskId },
      include: { agent: true },
    });

    if (!task) {
      this.logger.error(`Task dengan ID ${taskId} tidak ditemukan`);
      return;
    }

    const { agent } = task;

    // Update task ke RUNNING & agent presence ke WORKING
    await this.db.task.update({
      where: { id: task.id },
      data: { status: 'RUNNING' },
    });

    await this.db.agentPresence.upsert({
      where: { agentId: agent.id },
      create: {
        agentId: agent.id,
        status: 'WORKING',
        location: 'DESK',
        currentTaskId: task.id,
      },
      update: {
        status: 'WORKING',
        location: 'DESK',
        currentTaskId: task.id,
      },
    });

    const startTime = Date.now();

    try {
      const system = [
        `Kamu adalah ${agent.name}, ${agent.role}.`,
        `Jobdesk: ${agent.jobdesk}`,
        agent.systemPrompt ? `Instruksi tambahan: ${agent.systemPrompt}` : '',
        `Aturan kerja:`,
        `- Kerjakan tugas sekarang. Jika ada detail kecil yang kurang (misalnya nama merek atau periode), gunakan placeholder seperti [NAMA BRAND] atau asumsi yang wajar, lalu tulis asumsinya di "assumptions".`,
        `- Gunakan status NEEDS_INFO hanya jika tugas mustahil dikerjakan tanpa jawaban dari owner.`,
        `- Jangan mengarang fakta, angka, atau sumber.`,
        `- Gunakan bahasa Indonesia.`,
        `Balas hanya dengan satu objek JSON tanpa teks lain dan tanpa markdown, dengan format:`,
        `{"status":"DONE atau NEEDS_INFO","result":"hasil kerja","assumptions":["..."],"questions":["..."]}`,
      ]
        .filter(Boolean)
        .join('\n');

      const r = await this.llm.chat(system, `${task.title}\n\n${task.description}`);
      const latencyMs = Date.now() - startTime;
      const env = parseEnvelope(r.text);
      const blocked = env.status === 'NEEDS_INFO';

      const body = blocked
        ? `Butuh informasi dari owner:\n- ${env.questions.join('\n- ')}`
        : env.result + (env.assumptions.length ? `\n\nAsumsi:\n- ${env.assumptions.join('\n- ')}` : '');

      // Catat riwayat eksekusi ke task_runs
      await this.db.taskRun.create({
        data: {
          taskId: task.id,
          agentId: agent.id,
          model: r.model || 'default',
          promptTokens: r.usage?.prompt_tokens ?? null,
          completionTokens: r.usage?.completion_tokens ?? null,
          totalTokens: r.usage?.total_tokens ?? null,
          latencyMs,
          status: blocked ? 'BLOCKED' : 'SUCCESS',
        },
      });

      // Update hasil task
      await this.db.task.update({
        where: { id: task.id },
        data: {
          status: blocked ? 'BLOCKED' : 'DONE',
          result: body,
          modelUsed: r.model,
          totalTokens: r.usage?.total_tokens ?? null,
          finishedAt: blocked ? null : new Date(),
        },
      });

      // Kembalikan presence agen ke IDLE
      await this.db.agentPresence.upsert({
        where: { agentId: agent.id },
        create: { agentId: agent.id, status: 'IDLE', location: 'DESK', currentTaskId: null },
        update: { status: 'IDLE', currentTaskId: null },
      });

      this.logger.log(`Task ${taskId} selesai dengan status ${blocked ? 'BLOCKED' : 'DONE'} (${latencyMs}ms)`);
      return { status: blocked ? 'BLOCKED' : 'DONE' };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = String(e.message || e).slice(0, 1000);

      this.logger.error(`Task ${taskId} gagal: ${errorMsg}`);

      // Catat kegagalan ke task_runs
      await this.db.taskRun.create({
        data: {
          taskId: task.id,
          agentId: agent.id,
          model: 'unknown',
          latencyMs,
          status: 'FAILED',
          error: errorMsg,
        },
      });

      await this.db.task.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          error: errorMsg,
          finishedAt: new Date(),
        },
      });

      await this.db.agentPresence.upsert({
        where: { agentId: agent.id },
        create: { agentId: agent.id, status: 'IDLE', location: 'DESK', currentTaskId: null },
        update: { status: 'IDLE', currentTaskId: null },
      });

      throw e;
    }
  }
}
