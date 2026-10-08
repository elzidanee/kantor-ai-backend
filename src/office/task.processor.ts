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
import { LocalFilesService } from '../local-files/local-files.service.js';
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
    private readonly localFiles: LocalFilesService,
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
        `Kamu adalah ${agent.name}, ${agent.role} di Kantor AI (Autonomous Enterprise Workspace).`,
        `Keahlian & Jobdesk:`,
        agent.jobdesk,
        agent.systemPrompt ? `Panduan Peran Khusus:\n${agent.systemPrompt}` : '',
        `STANDAR KUALITAS JAWABAN (SEPERTI AI ASISTEN TERBAIK KELAS DUNIA - CHATGPT / CLAUDE / GEMINI):`,
        `- Tuliskan jawaban yang SANGAT BAGUS, LENGKAP, MENDALAM, TERTATA RAPI, dan SIAP PAKAI (PRODUCTION-READY).`,
        `- DILARANG KERAS memberikan jawaban singkat atau seadanya, potongan kode terpotong, atau kalimat penolakan.`,
        `- STRUKTUR DELIVERABLE WAJIB SESUAI PERAN:`,
        `  * Jika tugas KONTEN / COPYWRITING / SOSMED:`,
        `    - Tulis naskah lengkap yang memikat dan persuasif (menggunakan formula Hook + Story + Offer + CTA).`,
        `    - Sediakan minimal 2-3 VARIASI OPSI (Opsi 1: Menarik & Kasual, Opsi 2: Profesional & Edukatif, Opsi 3: Singkat & Punchy).`,
        `    - Sertakan Call to Action (CTA) yang jelas, emoji yang pas, serta daftar hashtag (#) relevan dan tips visual posting.`,
        `  * Jika tugas KODE / TEKNIKAL / BACKEND / FRONTEND:`,
        `    - Tuliskan kode LENGKAP tanpa disingkat (Clean Code), dengan penanganan error (error handling), tipe data/interfaces TypeScript, dan arsitektur modular.`,
        `    - Berikan penjelasan arsitektur, cara kerja, dan panduan langkah demi langkah cara integrasi/menjalankannya.`,
        `  * Jika tugas QA / TESTING / AUDIT:`,
        `    - Susun Test Plan & Test Case komprehensif (ID Test, Kategori, Prasyarat, Langkah Uji, Data Uji, Ekspektasi Hasil, dan Edge Cases).`,
        `  * Jika tugas MARKETING / STRATEGI:`,
        `    - Susun rencana terperinci meliputi target persona, Unique Selling Proposition (USP), kanal distribusi, pesan kunci, dan indikator keberhasilan (KPI).`,
        `- Gunakan format Markdown yang indah (headings ##, ###, bullet points, numbered list, bold **, code block, quote >).`,
        `- Gunakan bahasa Indonesia yang ramah, sopan, solutif, dan profesional.`,
        `- DILARANG BANYAK TANYA ATAU MEMINTA KLARIFIKASI KE OWNER!`,
        `- Jika informasi sudah cukup atau bisa diambil kesimpulan logis, WAJIB LANGSUNG BUAT HASIL FINALNYA SECARA LENGKAP DAN TUNTAS!`,
        `- Gunakan asumsi profesional terbaik untuk melengkapi detail teknis/kreatif dan cantumkan di field "assumptions".`,
        `- JANGAN isi "open_questions" jika tugas sudah selesai. Kosongkan menjadi: "open_questions": [].`,
        `- "status" WAJIB "DONE".`,
        `KEMAMPUAN FILE & DIREKTORI LOKAL:`,
        `- Sistem ini memiliki akses pembaca file & struktur direktori lokal riil. Jika terdapat data atau cuplikan file lokal yang dilampirkan, jadikan data tersebut sebagai referensi utama yang akurat.`,
        `- DILARANG mengatakan "saya tidak punya akses ke file lokal" jika data file lokal telah disediakan di dalam konteks tugas.`,
        `FORMAT KELUARAN WAJIB:`,
        `Balas HANYA dengan SATU objek JSON tanpa awalan/akhiran markdown di luar JSON:`,
        `{`,
        `  "status": "DONE",`,
        `  "summary": "Ringkasan eksekutif 2-4 kalimat yang komprehensif dan solutif mengenai apa yang telah dikerjakan secara final",`,
        `  "deliverables": [`,
        `    { "type": "CODE" | "TEXT" | "CONFIG", "name": "nama_file_atau_dokumen", "content": "isi lengkap, kaya, dan siap pakai menggunakan format markdown yang terstruktur rapi" }`,
        `  ],`,
        `  "criteria_check": [`,
        `    { "criterion": "kriteria yang dipenuhi", "met": true, "note": "penjelasan detail bagaimana kriteria ini dipenuhi" }`,
        `  ],`,
        `  "assumptions": ["asumsi profesional yang digunakan agar pekerjaan tuntas 100% tanpa merepotkan Owner"],`,
        `  "open_questions": [],`,
        `  "handoff": { "to_role": "QA", "note": "catatan untuk peran berikutnya" },`,
        `  "confidence": 0.98`,
        `}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const userPromptParts: string[] = [
        `# TUGAS: ${task.title}`,
        `Deskripsi: ${task.description}`,
      ];

      // Masukkan Deteksi Otomatis Pembacaan File Lokal jika deskripsi atau judul menyebutkan file/path lokal
      const detectedLocalFiles = this.localFiles.detectAndExtractFileContext(
        `${task.title}\n${task.description}`,
      );
      if (detectedLocalFiles) {
        userPromptParts.push(detectedLocalFiles);
      }

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

      // 5. Tentukan status akhir task: JIKA SUDAH ADA DELIVERABLES, LANGSUNG SELESAI (DONE)!
      const hasDeliverables = Array.isArray(envelope.deliverables) && envelope.deliverables.length > 0;
      const isExplicitlyBlocked =
        (envelope.status === 'BLOCKED' || envelope.status === 'CANNOT_DO' || envelope.status === 'NEEDS_INFO') &&
        !hasDeliverables;

      let nextStatus: 'DONE' | 'REVIEW' | 'BLOCKED' = 'DONE';

      if (isExplicitlyBlocked) {
        nextStatus = 'BLOCKED';
      } else if (task.needsReview) {
        nextStatus = 'REVIEW';
      } else {
        // Output sudah ada dan tuntas: LANGSUNG STATUS DONE!
        nextStatus = 'DONE';
      }

      // HANYA minta konfirmasi/tanya Owner jika BENAR-BENAR TERBLOKIR TANPA HASIL (isExplicitlyBlocked)
      if (isExplicitlyBlocked) {
        const questionText = envelope.open_questions?.[0] || 'Mohon arahan dan detail kebutuhan tambahan untuk kelanjutan tugas ini.';
        
        if (task.goalId) {
          const currentGoal = await this.db.goal.findUnique({ where: { id: task.goalId } });
          if (currentGoal) {
            const existingQ = currentGoal.openQuestions || [];
            const newQuestions = Array.from(new Set([...existingQ, ...(envelope.open_questions || [questionText])]));
            await this.db.goal.update({
              where: { id: task.goalId },
              data: {
                status: 'NEEDS_CLARIFICATION',
                openQuestions: newQuestions,
              },
            });
          }
        }

        // Tampilkan speech bubble agen menanyakan ke Owner
        await this.presence.updatePresence(agent.id, {
          status: 'IDLE',
          location: 'DESK',
          currentTaskId: null,
          bubbleText: `❓ Owner, butuh info: ${questionText.slice(0, 75)}`,
          bubbleType: 'WAITING',
        });

        await this.activityLog.log({
          eventType: 'NEED_CLARIFICATION',
          taskId: task.id,
          goalId: task.goalId,
          agentId: agent.id,
          description: `[Tanya Owner] Agen ${agent.name} menanyakan kebutuhan untuk "${task.title}": ${questionText}`,
          metadata: { questions: envelope.open_questions },
        });
      }

      // Format teks human-readable gabungan ala AI Asisten Kelas Dunia (ChatGPT / Claude / Gemini)
      const greeting = `Halo Owner! 👋 Berikut adalah solusi dan hasil pengerjaan lengkap untuk tugas **"${task.title}"** yang telah saya selesaikan dengan cermat:`;

      const summarySection = envelope.summary
        ? `### 📋 Ringkasan Eksekutif & Solusi\n${envelope.summary}`
        : '';

      const deliverableTexts = (envelope.deliverables || [])
        .map((d) => `### ${d.name} (${d.type || 'TEXT'})\n${d.content}`)
        .join('\n\n');

      const criteriaCheckText = (envelope.criteria_check || []).length
        ? `### ✅ Checklist Verifikasi Kriteria Penerimaan\n` +
          envelope.criteria_check.map((c) => `- [${c.met ? 'x' : ' '}] **${c.criterion}**${c.note ? ` — *${c.note}*` : ''}`).join('\n')
        : '';

      const assumptionsText = (envelope.assumptions || []).length
        ? `### 💡 Pendekatan & Asumsi Desain\n` +
          envelope.assumptions.map((a) => `- ${a}`).join('\n')
        : '';

      const questionsText = (envelope.open_questions || []).length
        ? `### ❓ Catatan & Saran Penyempurnaan untuk Owner\n` +
          `*Untuk pengembangan atau penyesuaian lebih lanjut, berikut beberapa poin yang dapat dikonfirmasi:*\n` +
          envelope.open_questions.map((q) => `- ${q}`).join('\n')
        : '';

      const closing = `\n---\n*Seluruh hasil di atas telah disesuaikan dengan standar industri dan siap digunakan. Jika ada bagian yang ingin disesuaikan atau dikembangkan lebih lanjut, silakan beri tahu saya!* 🚀`;

      const humanResult = [
        greeting,
        summarySection,
        deliverableTexts,
        criteriaCheckText,
        assumptionsText,
        questionsText,
        closing,
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
          status: 'SUCCESS',
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
        status: 'SUCCESS',
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

      // 10. Picu Dependency Resolver untuk membuka antrean task berikutnya agar tidak ada yang tertahan
      await this.goal.resolveDependencies(task.id);

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
