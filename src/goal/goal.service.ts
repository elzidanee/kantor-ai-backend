import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { ActivityLogService } from '../activity/activity-log.service.js';
import {
  CreateGoalDto,
  GoalPlanResult,
  GoalTriageCategory,
  GoalTriageResult,
  PlanTaskItem,
} from './goal.interface.js';
import {
  buildDecompositionPrompt,
  buildTriagePrompt,
  validateGoalPlan,
} from './pm-planner.js';

@Injectable()
export class GoalService implements OnModuleInit {
  private readonly logger = new Logger(GoalService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly llm: LlmService,
    private readonly presence: PresenceService,
    private readonly activityLog: ActivityLogService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {}

  async onModuleInit() {
    setTimeout(async () => {
      try {
        await this.unblockAllTasks();
      } catch (err: any) {
        this.logger.warn(`Auto unblock initial error: ${err.message}`);
      }
    }, 1500);
  }

  /**
   * Helper mencari agent yang paling cocok dengan peran yang diminta PM
   */
  private matchAgentForRole(roleStr: string, agents: any[]): any {
    const r = (roleStr || '').toLowerCase();

    // 1. Cek kecocokan eksplisit
    const matched = agents.find((a) => {
      const aRole = (a.role || '').toLowerCase();
      const aJobdesk = (a.jobdesk || '').toLowerCase();
      if (r.includes('front') || r === 'fe') return aRole.includes('front') || aJobdesk.includes('frontend');
      if (r.includes('back') || r === 'be') return aRole.includes('back') || aJobdesk.includes('backend');
      if (r.includes('qa') || r.includes('test')) return aRole.includes('qa') || aRole.includes('test');
      if (r.includes('content') || r.includes('copy')) return aRole.includes('content') || aJobdesk.includes('konten');
      if (r.includes('market') || r.includes('growth')) return aRole.includes('market') || aJobdesk.includes('pemasaran');
      if (r.includes('support') || r.includes('cs')) return aRole.includes('support') || aJobdesk.includes('pelanggan');
      if (r.includes('pm') || r.includes('project')) return aRole.includes('pm') || aRole.includes('project');
      return aRole.includes(r);
    });

    if (matched) return matched;
    // Fallback ke agent aktif pertama
    return agents[0];
  }

  /**
   * Cari agent PM Dewi di kantor
   */
  private async getPmAgent() {
    const agents = await this.db.agent.findMany({ where: { active: true } });
    const pm = agents.find(
      (a) =>
        a.role.toLowerCase().includes('pm') ||
        a.role.toLowerCase().includes('project manager') ||
        a.name.toLowerCase().includes('dewi'),
    );
    return { pm: pm || agents[0], activeAgents: agents };
  }

  /**
   * Owner menginput target baru -> Dewi PM triage & auto-breakdown ke sub-tasks
   */
  async createGoal(dto: CreateGoalDto) {
    const { pm, activeAgents } = await this.getPmAgent();
    if (!pm) {
      throw new BadRequestException('Belum ada agent aktif di kantor. Silakan inisialisasi agent terlebih dahulu.');
    }

    const title = dto.title || (dto.text.length > 60 ? `${dto.text.slice(0, 57)}...` : dto.text);

    // 1. Simpan Goal awal ke database
    const goal = await this.db.goal.create({
      data: {
        title,
        text: dto.text,
        status: 'PLANNING',
        createdBy: 'owner',
      },
    });

    // 2. Beri visualisasi ke UI bahwa Dewi PM sedang menganalisis target
    await this.presence.updatePresence(pm.id, {
      status: 'WORKING',
      location: 'DESK',
      bubbleText: 'Lagi menganalisis target dari Owner nih...',
      bubbleType: 'THINKING',
    });

    await this.activityLog.log({
      eventType: 'GOAL_LIFECYCLE',
      goalId: goal.id,
      agentId: pm.id,
      description: `Owner membuat target baru: "${title}"`,
      metadata: { text: dto.text },
    });

    // 3. Langkah 1: Intake Triage menggunakan LLM (dengan timeout cerdas 5 detik)
    let triage: GoalTriageResult;
    try {
      const triagePrompt = buildTriagePrompt(dto.text, activeAgents);
      const triageRes = await Promise.race([
        this.llm.chat(triagePrompt.systemPrompt, triagePrompt.userPrompt),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Triage LLM timeout')), 5000),
        ),
      ]);

      const cleanJson = triageRes.text.replace(/```json\n?|```/g, '').trim();
      triage = JSON.parse(cleanJson);
    } catch (err: any) {
      this.logger.warn(`Triage LLM fallback digunakan: ${err.message}`);
      const lower = dto.text.toLowerCase();
      let category: GoalTriageCategory = 'MULTI_TASK';
      if (lower.includes('status') || lower.includes('sudah sampai mana')) {
        category = 'STATUS_QUERY';
      } else if (lower.length < 8) {
        category = 'AMBIGUOUS';
      }

      triage = {
        category,
        summary: title,
        roles_needed: ['FRONTEND', 'BACKEND', 'QA'],
        missing_info: [],
        risk: 'LOW',
        clarification_questions:
          category === 'AMBIGUOUS'
            ? ['Mohon sebutkan nama fitur atau tujuan spesifik yang ingin dibuat.']
            : undefined,
      };
    }

    // 4. Periksa hasil triage
    if (triage.category === 'STATUS_QUERY') {
      const updated = await this.db.goal.update({
        where: { id: goal.id },
        data: {
          status: 'DONE',
          classification: 'STATUS_QUERY',
          summary: triage.summary,
        },
      });
      await this.presence.updatePresence(pm.id, {
        status: 'IDLE',
        location: 'DESK',
        bubbleText: 'Informasi status target sudah diperbarui.',
        bubbleType: 'IDLE',
      });
      return { goal: updated, triage, tasks: [] };
    }

    if (triage.category === 'OUT_OF_SCOPE' || triage.category === 'UNSAFE') {
      const updated = await this.db.goal.update({
        where: { id: goal.id },
        data: {
          status: 'CANCELLED',
          classification: triage.category,
          summary: triage.summary,
        },
      });
      await this.presence.updatePresence(pm.id, {
        status: 'IDLE',
        location: 'DESK',
        bubbleText: 'Target ini berada di luar batas operasional kantor.',
        bubbleType: 'IDLE',
      });
      return { goal: updated, triage, tasks: [] };
    }

    if (triage.category === 'AMBIGUOUS') {
      // Jika instruksi sudah memiliki teks yang cukup (>= 10 karakter), jangan membebani Owner dengan pertanyaan!
      // Langsung ubah ke MULTI_TASK dan eksekusi dengan asumsi cerdas terbaik.
      if (dto.text.trim().length >= 10) {
        triage.category = 'MULTI_TASK';
      } else {
        const questions = triage.clarification_questions || ['Mohon jelaskan detail target ini lebih spesifik.'];
        const updated = await this.db.goal.update({
          where: { id: goal.id },
          data: {
            status: 'NEEDS_CLARIFICATION',
            classification: 'AMBIGUOUS',
            summary: triage.summary,
            openQuestions: questions,
          },
        });

        await this.presence.updatePresence(pm.id, {
          status: 'IDLE',
          location: 'DESK',
          bubbleText: 'Aku butuh klarifikasi sedikit dari Owner nih...',
          bubbleType: 'WAITING',
        });

        this.presence.broadcastOfficeStatus({
          status: 'OPEN',
          summary: `Goal "${title}" membutuhkan klarifikasi dari owner.`,
        });

        return { goal: updated, triage, openQuestions: questions, tasks: [] };
      }
    }

    // 5. Langkah 2: Perencanaan & Dekomposisi Tugas (SINGLE_TASK atau MULTI_TASK)
    return this.executeGoalDecomposition(goal.id, dto.text, triage, pm, activeAgents);
  }

  /**
   * Eksekusi dekomposisi rencana target oleh PM
   */
  private async executeGoalDecomposition(
    goalId: string,
    goalText: string,
    triage: GoalTriageResult,
    pm: any,
    activeAgents: any[],
    clarificationAnswer?: string,
  ) {
    let plan: GoalPlanResult;
    try {
      const decompPrompt = buildDecompositionPrompt(goalText, activeAgents, clarificationAnswer);
      const decompRes = await Promise.race([
        this.llm.chat(decompPrompt.systemPrompt, decompPrompt.userPrompt),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Decomposition LLM timeout')), 6000),
        ),
      ]);

      const cleanJson = decompRes.text.replace(/```json\n?|```/g, '').trim();
      plan = JSON.parse(cleanJson);
    } catch (err: any) {
      this.logger.warn(`Rencana PM fallback digunakan: ${err.message}`);
      const lower = goalText.toLowerCase();
      const generatedTasks: PlanTaskItem[] = [];

      // Heuristic parsing sesuai kata kunci target owner
      if (lower.includes('content') || lower.includes('copy') || lower.includes('caption') || lower.includes('tulisan') || lower.includes('artikel') || lower.includes('naskah')) {
        generatedTasks.push({
          key: `T${generatedTasks.length + 1}`,
          title: 'Pembuatan Konten & Naskah Copywriting',
          role: 'CONTENT',
          description: `Susun materi konten dan penulisan kreatif untuk: ${goalText}`,
          acceptance_criteria: ['Naskah menarik, profesional, dan persuasif', 'Sesuai dengan target audiens'],
          deliverable: 'TEXT',
          depends_on: [],
          priority: 'NORMAL',
        });
      }

      if (lower.includes('market') || lower.includes('promosi') || lower.includes('campaign') || lower.includes('iklan')) {
        generatedTasks.push({
          key: `T${generatedTasks.length + 1}`,
          title: 'Strategi & Distribusi Pemasaran',
          role: 'MARKETING',
          description: `Rancang strategi pemasaran dan penargetan untuk: ${goalText}`,
          acceptance_criteria: ['Target audiens jelas', 'Kanal distribusi dan penawaran ditentukan'],
          deliverable: 'TEXT',
          depends_on: [],
          priority: 'NORMAL',
        });
      }

      if (lower.includes('backend') || lower.includes('endpoint') || lower.includes('api') || lower.includes('register') || lower.includes('database')) {
        generatedTasks.push({
          key: `T${generatedTasks.length + 1}`,
          title: 'Implementasi API & Backend Service',
          role: 'BACKEND',
          description: `Bangun API backend untuk kebutuhan: ${goalText}`,
          acceptance_criteria: ['Endpoint aktif dan divalidasi', 'Format JSON envelope sesuai standar'],
          deliverable: 'CODE',
          depends_on: [],
          priority: 'NORMAL',
        });
      }

      if (lower.includes('frontend') || lower.includes('form') || lower.includes('halaman') || lower.includes('tampilan') || lower.includes('ui')) {
        const hasBackend = generatedTasks.some((t) => t.role === 'BACKEND');
        generatedTasks.push({
          key: `T${generatedTasks.length + 1}`,
          title: 'Implementasi Komponen UI & Frontend',
          role: 'FRONTEND',
          description: `Bangun tampilan dan integrasi antarmuka untuk: ${goalText}`,
          acceptance_criteria: ['Tampilan responsif', 'Form berfungsi dan terhubung'],
          deliverable: 'CODE',
          depends_on: hasBackend ? ['T1'] : [],
          priority: 'NORMAL',
        });
      }

      if (lower.includes('qa') || lower.includes('test') || lower.includes('uji')) {
        const lastDep = generatedTasks.length ? [generatedTasks[generatedTasks.length - 1].key] : [];
        generatedTasks.push({
          key: `T${generatedTasks.length + 1}`,
          title: 'Pengujian QA & Verifikasi Fitur',
          role: 'QA',
          description: `Verifikasi seluruh alur dan uji fungsionalitas untuk: ${goalText}`,
          acceptance_criteria: ['Semua skenario pengujian sukses', 'Bebas regresi'],
          deliverable: 'TEXT',
          depends_on: lastDep,
          priority: 'NORMAL',
        });
      }

      if (generatedTasks.length === 0) {
        generatedTasks.push({
          key: 'T1',
          title: `Eksekusi ${goalText.slice(0, 40)}`,
          role: 'CONTENT',
          description: goalText,
          acceptance_criteria: ['Fungsi berjalan sesuai permintaan', 'Bebas error'],
          deliverable: 'TEXT',
          depends_on: [],
          priority: 'NORMAL',
        });
      }

      plan = {
        goal_summary: goalText,
        assumptions: ['Menggunakan stack standar kantor AI'],
        tasks: generatedTasks,
      };
    }

    // Validasi rencana sesuai logicagent.md
    const validation = validateGoalPlan(plan.tasks);
    if (!validation.valid) {
      this.logger.warn(`Rencana PM tidak valid (${validation.error}), menormalkan rencana...`);
      // Bersihkan dependensi yang salah jika ada
      plan.tasks = plan.tasks.map((t) => ({
        ...t,
        depends_on: [],
        acceptance_criteria: t.acceptance_criteria?.length ? t.acceptance_criteria : ['Sesuai spesifikasi'],
      }));
    }

    // 6. Buat Task di database dan mapping kunci T1, T2 -> task ID DB
    const keyToTaskIdMap = new Map<string, string>();
    const createdTasks: any[] = [];

    for (const t of plan.tasks) {
      const assignedAgent = this.matchAgentForRole(t.role, activeAgents);
      const newTask = await this.db.task.create({
        data: {
          goalId,
          taskKey: t.key,
          agentId: assignedAgent.id,
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptance_criteria,
          deliverableType: t.deliverable || 'TEXT',
          priority: t.priority === 'HIGH' ? 'HIGH' : t.priority === 'LOW' ? 'LOW' : 'NORMAL',
          status: 'PENDING', // sementara pending sampai dependensi dipetakan
          needsReview: true,
        },
        include: { agent: true },
      });
      keyToTaskIdMap.set(t.key, newTask.id);
      createdTasks.push({ ...newTask, rawDependsOn: t.depends_on || [] });
    }

    // 7. Perbarui relasi dependsOn dengan ID tugas database riil & pisahkan yang BLOCKED vs QUEUED
    const unblockedTasks: any[] = [];
    for (const ct of createdTasks) {
      const actualDependsOnIds = ct.rawDependsOn
        .map((depKey: string) => keyToTaskIdMap.get(depKey))
        .filter(Boolean) as string[];

      const hasDeps = actualDependsOnIds.length > 0;
      const initialStatus = hasDeps ? 'PENDING' : 'QUEUED';

      const updatedTask = await this.db.task.update({
        where: { id: ct.id },
        data: {
          dependsOn: actualDependsOnIds,
          status: initialStatus,
        },
        include: { agent: true },
      });

      if (!hasDeps) {
        unblockedTasks.push(updatedTask);
        // Masukkan task yang bebas dependensi ke antrean BullMQ
        await this.taskQueue.add(
          'process-task',
          { taskId: updatedTask.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );

        this.presence.broadcastTaskUpdated({
          id: updatedTask.id,
          title: updatedTask.title,
          status: 'QUEUED',
          agentId: updatedTask.agentId,
          priority: updatedTask.priority,
        });
      } else {
        this.presence.broadcastTaskUpdated({
          id: updatedTask.id,
          title: updatedTask.title,
          status: 'BLOCKED',
          agentId: updatedTask.agentId,
          priority: updatedTask.priority,
        });
      }
    }

    // 8. Update status Goal menjadi IN_PROGRESS
    const updatedGoal = await this.db.goal.update({
      where: { id: goalId },
      data: {
        status: 'IN_PROGRESS',
        classification: triage.category,
        summary: plan.goal_summary,
        assumptions: plan.assumptions || [],
      },
      include: {
        tasks: {
          include: { agent: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // 9. Update balon dialog PM Dewi
    await this.presence.updatePresence(pm.id, {
      status: 'IDLE',
      location: 'DESK',
      bubbleText: `Target sudah dipecah jadi ${plan.tasks.length} tugas dan didelegasikan!`,
      bubbleType: 'IDLE',
    });

    await this.activityLog.log({
      eventType: 'GOAL_LIFECYCLE',
      goalId,
      agentId: pm.id,
      description: `Dewi PM memecah target menjadi ${plan.tasks.length} sub-tugas terstruktur`,
      metadata: {
        tasksCount: plan.tasks.length,
        unblockedCount: unblockedTasks.length,
      },
    });

    return {
      goal: updatedGoal,
      triage,
      plan,
      unblockedCount: unblockedTasks.length,
      blockedCount: plan.tasks.length - unblockedTasks.length,
    };
  }

  /**
   * Owner menjawab pertanyaan klarifikasi PM
   */
  async clarifyGoal(goalId: string, answer: string) {
    const goal = await this.db.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException(`Goal dengan ID ${goalId} tidak ditemukan`);
    if (goal.status !== 'NEEDS_CLARIFICATION') {
      throw new BadRequestException(`Goal tidak sedang menunggu klarifikasi (status saat ini: ${goal.status})`);
    }

    const { pm, activeAgents } = await this.getPmAgent();

    await this.presence.updatePresence(pm.id, {
      status: 'WORKING',
      location: 'DESK',
      bubbleText: 'Terima kasih atas klarifikasinya! Melanjutkan perencanaan...',
      bubbleType: 'THINKING',
    });

    await this.activityLog.log({
      eventType: 'GOAL_LIFECYCLE',
      goalId,
      description: `Owner memberikan jawaban klarifikasi: "${answer}"`,
    });

    const triage: GoalTriageResult = {
      category: 'MULTI_TASK',
      summary: goal.summary || goal.text,
      roles_needed: [],
      missing_info: [],
      risk: 'LOW',
    };

    return this.executeGoalDecomposition(goalId, goal.text, triage, pm, activeAgents, answer);
  }

  /**
   * DEPENDENCY RESOLVER:
   * Dipanggil otomatis saat suatu task selesai (status 'DONE').
   * Membuka blokade task turunan yang dependensinya sudah terpenuhi.
   */
  async resolveDependencies(completedTaskId: string) {
    const completedTask = await this.db.task.findUnique({
      where: { id: completedTaskId },
      include: { goal: true },
    });

    if (!completedTask) return;

    // Cari seluruh task berstatus PENDING atau BLOCKED di kantor (atau dalam goal yang sama)
    const waitingTasks = await this.db.task.findMany({
      where: {
        status: { in: ['PENDING', 'BLOCKED'] },
        ...(completedTask.goalId ? { goalId: completedTask.goalId } : {}),
      },
      include: { agent: true },
    });

    for (const bt of waitingTasks) {
      if (!bt.dependsOn || bt.dependsOn.length === 0) continue;

      // Cek apakah seluruh task dalam dependsOn sudah selesai (status 'DONE' atau 'REVIEW')
      const prereqs = await this.db.task.findMany({
        where: { id: { in: bt.dependsOn } },
        select: { id: true, status: true },
      });

      const allPrereqsDone =
        prereqs.length === bt.dependsOn.length &&
        prereqs.every((p) => p.status === 'DONE' || p.status === 'REVIEW');

      if (allPrereqsDone) {
        this.logger.log(
          `[Dependency Resolver] Membuka antrean task ${bt.id} (${bt.title}) -> Status berubah ke QUEUED`,
        );

        // Update ke QUEUED
        const updated = await this.db.task.update({
          where: { id: bt.id },
          data: { status: 'QUEUED' },
          include: { agent: true },
        });

        // Masukkan ke antrean BullMQ
        await this.taskQueue.add(
          'process-task',
          { taskId: updated.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );

        this.presence.broadcastTaskUpdated({
          id: updated.id,
          title: updated.title,
          status: 'QUEUED',
          agentId: updated.agentId,
          priority: updated.priority,
        });

        await this.activityLog.log({
          eventType: 'TASK_LIFECYCLE',
          taskId: updated.id,
          goalId: updated.goalId,
          agentId: updated.agentId,
          description: `Task "${updated.title}" terbuka dari dependensi dan masuk antrean pengerjaan`,
        });
      }
    }

    // Cek apakah semua task dalam goal sudah berstatus DONE
    if (completedTask.goalId) {
      const goalTasks = await this.db.task.findMany({
        where: { goalId: completedTask.goalId },
        select: { status: true },
      });

      const allGoalTasksDone =
        goalTasks.length > 0 &&
        goalTasks.every((t) => t.status === 'DONE' || t.status === 'REVIEW');

      if (allGoalTasksDone) {
        const goalData = await this.db.goal.findUnique({ where: { id: completedTask.goalId } });
        const hasOpenQuestions = goalData?.openQuestions && goalData.openQuestions.length > 0;
        
        await this.db.goal.update({
          where: { id: completedTask.goalId },
          data: { status: hasOpenQuestions ? 'NEEDS_CLARIFICATION' : 'DONE' },
        });

        const { pm } = await this.getPmAgent();
        if (pm) {
          await this.presence.updatePresence(pm.id, {
            status: 'IDLE',
            location: 'DESK',
            bubbleText: 'Semua tugas untuk target selesai dengan sukses! Great job tim!',
            bubbleType: 'IDLE',
          });
        }

        await this.activityLog.log({
          eventType: 'GOAL_LIFECYCLE',
          goalId: completedTask.goalId,
          description: `Seluruh tugas untuk target "${completedTask.goal?.title || completedTask.goalId}" telah selesai 100%!`,
        });
      }
    }
  }

  async getGoals() {
    const goals = await this.db.goal.findMany({
      include: {
        tasks: {
          include: { agent: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return goals.map((g) => {
      const total = g.tasks.length;
      const done = g.tasks.filter((t) => t.status === 'DONE').length;
      const blocked = g.tasks.filter((t) => t.status === 'BLOCKED').length;
      const queued = g.tasks.filter((t) => t.status === 'QUEUED').length;
      const running = g.tasks.filter((t) => t.status === 'RUNNING').length;
      const percent = total ? Math.round((done / total) * 100) : 0;

      return {
        ...g,
        progress: {
          total,
          done,
          blocked,
          queued,
          running,
          percent,
        },
      };
    });
  }

  async getGoalById(id: string) {
    const goal = await this.db.goal.findUnique({
      where: { id },
      include: {
        tasks: {
          include: { agent: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!goal) throw new NotFoundException(`Goal dengan ID ${id} tidak ditemukan`);

    const total = goal.tasks.length;
    const done = goal.tasks.filter((t) => t.status === 'DONE').length;
    const blocked = goal.tasks.filter((t) => t.status === 'BLOCKED').length;
    const queued = goal.tasks.filter((t) => t.status === 'QUEUED').length;
    const running = goal.tasks.filter((t) => t.status === 'RUNNING').length;
    const percent = total ? Math.round((done / total) * 100) : 0;

    return {
      ...goal,
      progress: {
        total,
        done,
        blocked,
        queued,
        running,
        percent,
      },
    };
  }

  /**
   * UNBLOCK ALL TASKS:
   * Memastikan tidak ada satupun task yang tersangkut di status BLOCKED.
   * Mengalihkan task yang butuh info ke pertanyaan owner (REVIEW + openQuestions),
   * dan mengaktifkan task yang siap jalan ke antrean BullMQ (QUEUED).
   */
  async unblockAllTasks() {
    const blockedTasks = await this.db.task.findMany({
      where: { status: 'BLOCKED' },
      include: { goal: true, agent: true },
    });

    if (blockedTasks.length === 0) {
      return { message: 'Tidak ada task yang berstatus BLOCKED', unblocked: 0 };
    }

    this.logger.log(`[Unblock Manager] Menemukan ${blockedTasks.length} task BLOCKED. Memproses migrasi...`);

    let convertedToReview = 0;
    let convertedToQueued = 0;
    let convertedToPending = 0;

    for (const task of blockedTasks) {
      const outputEnvelope = task.outputEnvelope as any;
      const hasOutput = Boolean(task.result || (outputEnvelope && outputEnvelope.summary));

      if (hasOutput) {
        // Jika sudah ada output kerja, langsung selesaikan sebagai DONE tanpa menahan Owner!
        await this.db.task.update({
          where: { id: task.id },
          data: { status: 'DONE', finishedAt: task.finishedAt || new Date() },
        });
        convertedToReview++;

        // Buka dependensi berikutnya
        await this.resolveDependencies(task.id);
      } else {
        if (!task.dependsOn || task.dependsOn.length === 0) {
          await this.db.task.update({
            where: { id: task.id },
            data: { status: 'QUEUED' },
          });
          await this.taskQueue.add('process-task', { taskId: task.id }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          });
          convertedToQueued++;
        } else {
          const prereqs = await this.db.task.findMany({
            where: { id: { in: task.dependsOn } },
            select: { id: true, status: true },
          });
          const allPrereqsDone = prereqs.length === task.dependsOn.length &&
            prereqs.every((p) => p.status === 'DONE' || p.status === 'REVIEW');

          if (allPrereqsDone) {
            await this.db.task.update({
              where: { id: task.id },
              data: { status: 'QUEUED' },
            });
            await this.taskQueue.add('process-task', { taskId: task.id }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: 100,
              removeOnFail: 200,
            });
            convertedToQueued++;
          } else {
            await this.db.task.update({
              where: { id: task.id },
              data: { status: 'PENDING' },
            });
            convertedToPending++;
          }
        }
      }
    }

    // Cascade resolution across all DONE or REVIEW tasks
    const allDoneOrReview = await this.db.task.findMany({
      where: { status: { in: ['DONE', 'REVIEW'] } },
      select: { id: true },
    });
    for (const t of allDoneOrReview) {
      await this.resolveDependencies(t.id);
    }

    // Pulihkan seluruh Goal yang sempat tersangkut di status NEEDS_CLARIFICATION
    await this.db.goal.updateMany({
      where: { status: 'NEEDS_CLARIFICATION' },
      data: { status: 'IN_PROGRESS', openQuestions: [] },
    });

    await this.activityLog.log({
      eventType: 'TASK_LIFECYCLE',
      description: `[Sistem] Menormalkan ${blockedTasks.length} task BLOCKED: ${convertedToReview} diselesaikan langsung sebagai DONE, ${convertedToQueued} ke Antrean Aktif, ${convertedToPending} ke Pending giliran.`,
    });

    return {
      message: 'Seluruh task BLOCKED berhasil dinormalkan tanpa ada yang terblokir!',
      total: blockedTasks.length,
      convertedToReview,
      convertedToQueued,
      convertedToPending,
    };
  }
}
