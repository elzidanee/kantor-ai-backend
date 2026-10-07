import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { ScheduleService } from '../schedule/schedule.service.js';
import { parseAgentEnvelope, AgentEnvelope } from './task-envelope.js';

@Processor('office-tasks', { concurrency: 3 })
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    private readonly db: PrismaService,
    private readonly llm: LlmService,
    private readonly schedule: ScheduleService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<any> {
    const { taskId } = job.data;
    this.logger.log(`[Worker] Memproses task ${taskId} (Job ID: ${job.id})`);

    const task = await this.db.task.findUnique({
      where: { id: taskId },
      include: {
        agent: true,
        goal: true,
      },
    });

    if (!task) {
      this.logger.error(`Task dengan ID ${taskId} tidak ditemukan`);
      return;
    }

    const { agent } = task;

    // ==================== SCHEDULE GUARD ====================
    const { canWork, state } = await this.schedule.canAgentWork();
    if (!canWork) {
      this.logger.warn(
        `[Schedule Guard] Agent ${agent.name} ditunda: ${state.summary} (Status Kantor: ${state.status})`,
      );

      // 1. Update status presence agent sesuai kondisi (PRAYING di MUSHOLA, RESTING di LAPANGAN, dll)
      await this.db.agentPresence.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          status: state.suggestedPresence.status,
          location: state.suggestedPresence.location,
          currentTaskId: task.id,
        },
        update: {
          status: state.suggestedPresence.status,
          location: state.suggestedPresence.location,
        },
      });

      // 2. Re-queue task dengan delay sampai jendela kerja berikutnya
      const delayMs = Math.max(10_000, state.delayMs);
      await this.taskQueue.add(
        'process-task',
        { taskId: task.id },
        {
          delay: delayMs,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );

      return {
        status: 'DELAYED_BY_SCHEDULE',
        officeStatus: state.status,
        delayMs,
        reason: state.summary,
      };
    }

    // 1. Update status task -> RUNNING & agent presence -> WORKING di DESK
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
      // 2. Susun Konteks Prompt sesuai aturan logicagent.md
      const systemPrompt = [
        `Kamu adalah ${agent.name}, ${agent.role} di Kantor AI.`,
        `JOBDESK:`,
        agent.jobdesk,
        agent.systemPrompt ? `PANDUAN PERAN:\n${agent.systemPrompt}` : '',
        `ATURAN KERJA WAJIB:`,
        `- Kerjakan tugas sesuai jobdesk dan peranmu.`,
        `- Jika informasi inti tidak tersedia, jangan menebak. Isi "open_questions" dan set status "NEEDS_INFO".`,
        `- Jangan mengarang angka atau fakta.`,
        `- Penuhi seluruh kriteria penerimaan jika ada.`,
        `- Gunakan bahasa Indonesia baku dan profesional.`,
        `FORMAT KELUARAN WAJIB:`,
        `Balas HANYA dengan SATU objek JSON tanpa markdown dan tanpa teks pembuka/penutup, dengan format amplop:`,
        `{`,
        `  "status": "DONE" | "NEEDS_INFO" | "BLOCKED" | "CANNOT_DO",`,
        `  "summary": "Ringkasan hasil kerja 1-2 kalimat",`,
        `  "deliverables": [`,
        `    { "type": "CODE" | "TEXT" | "CONFIG", "name": "nama_file_atau_judul", "content": "isi lengkap hasil" }`,
        `  ],`,
        `  "criteria_check": [`,
        `    { "criterion": "nama kriteria", "met": true, "note": "catatan pemenuhan" }`,
        `  ],`,
        `  "assumptions": ["asumsi yang dipakai bila ada"],`,
        `  "open_questions": ["pertanyaan ke owner jika butuh info"],`,
        `  "handoff": { "to_role": "QA", "note": "catatan untuk peran berikutnya" },`,
        `  "confidence": 0.9`,
        `}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const userPromptParts: string[] = [
        `# TUGAS: ${task.title}`,
        `Deskripsi: ${task.description}`,
      ];

      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        userPromptParts.push(
          `KRITERIA PENERIMAAN (Acceptance Criteria):\n- ${task.acceptanceCriteria.join('\n- ')}`,
        );
      }

      if (task.revisionNotes) {
        userPromptParts.push(
          `CATATAN REVISI (Putaran ke-${task.revisionCount}):\nPerbaiki temuan berikut:\n${task.revisionNotes}`,
        );
        if (task.result) {
          userPromptParts.push(
            `HASIL SEBELUMNYA SEBAGAI ACUAN:\n${task.result.slice(0, 1000)}`,
          );
        }
      }

      const userPrompt = userPromptParts.join('\n\n');

      // 3. Panggil LLM via LlmService
      const r = await this.llm.chat(
        systemPrompt,
        userPrompt,
        3, // maxAttempts
      );
      const latencyMs = Date.now() - startTime;

      // 4. Parse amplop hasil JSON
      const envelope: AgentEnvelope = parseAgentEnvelope(r.text);

      // 5. Tentukan status akhir task berdasarkan logic mesin status
      let nextStatus: 'DONE' | 'REVIEW' | 'BLOCKED' = 'DONE';
      if (envelope.status === 'NEEDS_INFO' || envelope.status === 'BLOCKED' || envelope.status === 'CANNOT_DO') {
        nextStatus = 'BLOCKED';
      } else {
        // Jika status DONE, cek apakah perlu review (QA / Owner)
        const needsReview = task.needsReview || envelope.confidence < 0.5;
        nextStatus = needsReview ? 'REVIEW' : 'DONE';
      }

      // Format teks hasil agar ramah dibaca manusia
      const deliverableTexts = envelope.deliverables
        .map((d) => `### [${d.type}] ${d.name}\n${d.content}`)
        .join('\n\n');

      const assumptionsText = envelope.assumptions.length
        ? `\n\n**Asumsi:**\n- ${envelope.assumptions.join('\n- ')}`
        : '';

      const questionsText = envelope.open_questions.length
        ? `\n\n**Pertanyaan / Informasi yang dibutuhkan:**\n- ${envelope.open_questions.join('\n- ')}`
        : '';

      const criteriaCheckText = envelope.criteria_check.length
        ? `\n\n**Pemeriksaan Kriteria:**\n` +
          envelope.criteria_check
            .map((c) => `- [${c.met ? 'x' : ' '}] ${c.criterion}${c.note ? ` (${c.note})` : ''}`)
            .join('\n')
        : '';

      const humanResult = [
        envelope.summary,
        deliverableTexts,
        criteriaCheckText,
        assumptionsText,
        questionsText,
      ]
        .filter(Boolean)
        .join('\n\n');

      // 6. Simpan TaskRun ke database
      await this.db.taskRun.create({
        data: {
          taskId: task.id,
          agentId: agent.id,
          model: r.model || 'default',
          promptTokens: r.usage?.prompt_tokens ?? null,
          completionTokens: r.usage?.completion_tokens ?? null,
          totalTokens: r.usage?.total_tokens ?? null,
          latencyMs,
          status: nextStatus === 'BLOCKED' ? 'BLOCKED' : 'SUCCESS',
          envelope: envelope as any,
        },
      });

      // 7. Update Task dengan hasil amplop dan status
      await this.db.task.update({
        where: { id: task.id },
        data: {
          status: nextStatus,
          result: humanResult,
          outputEnvelope: envelope as any,
          modelUsed: r.model,
          totalTokens: r.usage?.total_tokens ?? null,
          finishedAt: nextStatus === 'DONE' ? new Date() : null,
        },
      });

      // 8. Kembalikan kehadiran agent ke IDLE di meja
      await this.db.agentPresence.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          status: 'IDLE',
          location: 'DESK',
          currentTaskId: null,
        },
        update: {
          status: 'IDLE',
          location: 'DESK',
          currentTaskId: null,
        },
      });

      this.logger.log(
        `[Worker] Task ${taskId} selesai -> status: ${nextStatus} (${latencyMs}ms, total tokens: ${r.usage?.total_tokens ?? 'N/A'})`,
      );
      return { status: nextStatus, summary: envelope.summary };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = String(err.message || err).slice(0, 1000);

      this.logger.error(`[Worker] Task ${taskId} gagal: ${errorMsg}`);

      // Catat kegagalan ke TaskRun
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

      // Update status task ke FAILED
      await this.db.task.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          error: errorMsg,
          finishedAt: new Date(),
        },
      });

      // Kembalikan presence agen ke IDLE
      await this.db.agentPresence.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          status: 'IDLE',
          location: 'DESK',
          currentTaskId: null,
        },
        update: {
          status: 'IDLE',
          location: 'DESK',
          currentTaskId: null,
        },
      });

      throw err;
    }
  }
}
