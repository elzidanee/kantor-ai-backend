import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { ScheduleService } from '../schedule/schedule.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { QuotaService } from '../quota/quota.service.js';
import { GoalService } from '../goal/goal.service.js';
import { ActivityLogService } from '../activity/activity-log.service.js';
import { parseAgentEnvelope, AgentEnvelope } from './task-envelope.js';

@Processor('office-tasks', { concurrency: 3 })
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    private readonly db: PrismaService,
    private readonly llm: LlmService,
    private readonly schedule: ScheduleService,
    private readonly presence: PresenceService,
    private readonly quota: QuotaService,
    private readonly goal: GoalService,
    private readonly activityLog: ActivityLogService,
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

      // 1. Update status presence agent & balon dialog sesuai jadwal (PRAYING di MUSHOLA, RESTING di LAPANGAN, dll)
      await this.presence.updatePresence(agent.id, {
        status: state.suggestedPresence.status,
        location: state.suggestedPresence.location,
        currentTaskId: task.id,
        blockName: state.activeBlock?.name,
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

    // ==================== QUOTA GUARD ====================
    const quotaCheck = await this.quota.checkQuota();
    if (!quotaCheck.allowed) {
      this.logger.warn(`[Quota Guard] Agent ${agent.name} ditunda: ${quotaCheck.reason}`);

      await this.presence.updatePresence(agent.id, {
        status: 'IDLE',
        location: 'DESK',
        bubbleText: 'Kuota harian kantor telah habis...',
        bubbleType: 'WAITING',
      });

      // Tunda 60 detik sebelum coba lagi
      await this.taskQueue.add(
        'process-task',
        { taskId: task.id },
        {
          delay: 60_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );

      return {
        status: 'DELAYED_BY_QUOTA',
        reason: quotaCheck.reason,
      };
    }

    // 1. Update status task -> RUNNING & agent presence -> WORKING di DESK (dengan balon dialog thinking)
    await this.db.task.update({
      where: { id: task.id },
      data: { status: 'RUNNING' },
    });

    await this.presence.updatePresence(agent.id, {
      status: 'WORKING',
      location: 'DESK',
      currentTaskId: task.id,
      taskTitle: task.title,
    });

    this.presence.broadcastTaskUpdated({
      id: task.id,
      title: task.title,
      status: 'RUNNING',
      agentId: agent.id,
      priority: task.priority,
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

      // Masukkan Kriteria Penerimaan jika ada
      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        userPromptParts.push(
          `KRITERIA PENERIMAAN:\n` +
            task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n'),
        );
      }

      // Masukkan Konteks Target (Goal) jika ada
      if (task.goal) {
        userPromptParts.push(`TARGET UTAMA: ${task.goal.text}`);
      }

      // Masukkan Catatan Revisi jika ini putaran revisi
      if (task.revisionCount > 0 && task.revisionNotes) {
        userPromptParts.push(
          `CATATAN REVISI SEBELUMNYA (Putaran ke-${task.revisionCount}):\n${task.revisionNotes}\nMohon perbaiki kekurangan sesuai catatan di atas.`,
        );
      }

      const userPrompt = userPromptParts.join('\n\n');

      // 3. Eksekusi LLM melalui gateway
      const r = await this.llm.chat(
        systemPrompt,
        userPrompt,
        3,
      );

      const latencyMs = Date.now() - startTime;

      // 4. Parsing amplop JSON keluaran agent
      const envelope: AgentEnvelope = parseAgentEnvelope(r.text);

      // 5. Tentukan status akhir task berdasarkan logicagent.md
      let nextStatus: 'DONE' | 'REVIEW' | 'BLOCKED' = 'DONE';

      if (envelope.status === 'BLOCKED' || envelope.status === 'CANNOT_DO' || envelope.status === 'NEEDS_INFO') {
        nextStatus = 'BLOCKED';
      } else if (task.needsReview) {
        nextStatus = 'REVIEW';
      } else if (envelope.confidence !== undefined && envelope.confidence < 0.5) {
        nextStatus = 'REVIEW';
      } else {
        nextStatus = 'DONE';
      }

      // Format teks human-readable gabungan untuk kolom result
      const deliverableTexts = (envelope.deliverables || [])
        .map((d) => `### ${d.name} (${d.type})\n${d.content}`)
        .join('\n\n');

      const criteriaCheckText = (envelope.criteria_check || [])
        .map((c) => `- [${c.met ? 'x' : ' '}] ${c.criterion}${c.note ? ` (${c.note})` : ''}`)
        .join('\n');

      const assumptionsText = (envelope.assumptions || []).length
        ? `\n\n**Asumsi:**\n` + envelope.assumptions.map((a) => `- ${a}`).join('\n')
        : '';

      const questionsText = (envelope.open_questions || []).length
        ? `\n\n**Pertanyaan Terbuka:**\n` + envelope.open_questions.map((q) => `- ${q}`).join('\n')
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

      // 8. Broadcast event task.updated dan run.finished ke client SSE
      this.presence.broadcastRunFinished({
        taskId: task.id,
        agentId: agent.id,
        model: r.model || 'default',
        totalTokens: r.usage?.total_tokens ?? null,
        latencyMs,
        status: nextStatus === 'BLOCKED' ? 'BLOCKED' : 'SUCCESS',
      });

      this.presence.broadcastTaskUpdated({
        id: task.id,
        title: task.title,
        status: nextStatus,
        agentId: agent.id,
        priority: task.priority,
      });

      // 9. Kembalikan kehadiran agent ke IDLE di meja & broadcast ke SSE
      await this.presence.updatePresence(agent.id, {
        status: 'IDLE',
        location: 'DESK',
        currentTaskId: null,
      });

      // 10. Jika status selesai 'DONE', picu Dependency Resolver untuk membuka task berikutnya
      if (nextStatus === 'DONE') {
        await this.goal.resolveDependencies(task.id);
      }

      await this.activityLog.log({
        eventType: 'TASK_LIFECYCLE',
        taskId: task.id,
        goalId: task.goalId,
        agentId: agent.id,
        description: `Task "${task.title}" selesai dengan status ${nextStatus} (${latencyMs}ms, ${r.usage?.total_tokens ?? 0} tokens)`,
        metadata: { latencyMs, tokens: r.usage?.total_tokens, status: nextStatus },
      });

      this.logger.log(
        `[Worker] Task ${taskId} selesai -> status: ${nextStatus} (${latencyMs}ms, tokens: ${r.usage?.total_tokens ?? 'N/A'})`,
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

      this.presence.broadcastTaskUpdated({
        id: task.id,
        title: task.title,
        status: 'FAILED',
        agentId: agent.id,
        priority: task.priority,
      });

      // Kembalikan presence agen ke IDLE
      await this.presence.updatePresence(agent.id, {
        status: 'IDLE',
        location: 'DESK',
        currentTaskId: null,
      });

      await this.activityLog.log({
        eventType: 'TASK_LIFECYCLE',
        taskId: task.id,
        goalId: task.goalId,
        agentId: agent.id,
        description: `Task "${task.title}" gagal: ${errorMsg}`,
        metadata: { error: errorMsg },
      });

      throw err;
    }
  }
}
