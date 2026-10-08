import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalFilesService } from '../local-files/local-files.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { ActivityLogService } from '../activity/activity-log.service.js';

export interface AutomationPreset {
  key: string;
  name: string;
  description: string;
  defaultRole: string;
  icon: string;
  promptTemplate: string;
}

export interface AutomationConfig {
  id: string;
  name: string;
  recipeKey: string;
  targetDirectory: string;
  filePatterns?: string[];
  agentId?: string;
  customPrompt?: string;
  isWatching: boolean;
  lastRunAt?: string;
  lastResultSummary?: string;
  createdAt: string;
}

export interface RunAutomationDto {
  recipeKey: string;
  targetDirectory: string;
  filePaths?: string[];
  customPrompt?: string;
  agentId?: string;
  title?: string;
}

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'CODE_AUDIT',
    name: 'Audit Kode & Keamanan Otomatis',
    description: 'Menganalisis file kode lokal untuk menemukan bug tersembunyi, celah keamanan, dan saran arsitektur modular.',
    defaultRole: 'backend',
    icon: 'ShieldCheck',
    promptTemplate:
      'Lakukan audit menyeluruh terhadap kode lokal terlampir. Periksa: (1) Celah keamanan atau data leak, (2) Efisiensi algoritma & memory leak, (3) Clean code & type safety, (4) Berikan kode refactor lengkap yang siap pakai untuk memperbaiki temuan utama.',
  },
  {
    key: 'DOC_GENERATOR',
    name: 'Auto-Generate Dokumentasi & API Spec',
    description: 'Membaca struktur file dan menghasilkan dokumentasi teknis, kontrak endpoint API, serta panduan arsitektur.',
    defaultRole: 'pm',
    icon: 'BookOpen',
    promptTemplate:
      'Susun dokumentasi teknis komprehensif berdasarkan source code lokal terlampir. Sertakan: (1) Gambaran arsitektur sistem, (2) Daftar fungsi/service/controller beserta penjelasannya, (3) Panduan integrasi/penggunaan, (4) Contoh kode pemanggilan yang jelas.',
  },
  {
    key: 'TEST_GENERATOR',
    name: 'Auto Test Suite & QA Plan',
    description: 'Membaca implementasi kode lokal dan menyusun rangkaian unit test, integration test, serta edge case coverage.',
    defaultRole: 'qa',
    icon: 'CheckCircle2',
    promptTemplate:
      'Susun Test Plan dan skrip Unit Testing (Vitest / Jest / Supertest) yang lengkap untuk kode lokal di atas. Sertakan pengujian skenario sukses (happy path), skenario gagal (error handling), dan batas ekstrem (edge cases).',
  },
  {
    key: 'CODE_OPTIMIZER',
    name: 'Optimasi Performa & Refactoring',
    description: 'Menganalisis kode untuk meningkatkan kecepatan eksekusi, mengurangi bundle size, dan merapikan komponen.',
    defaultRole: 'frontend',
    icon: 'Zap',
    promptTemplate:
      'Optimalkan kode lokal terlampir. Fokus pada: (1) Pengurangan re-render yang tidak perlu, (2) Modularisasi komponen agar reusable, (3) Kode bersih bebas duplikasi, (4) Berikan file implementasi baru yang rapi.',
  },
  {
    key: 'DOC_SUMMARIZER',
    name: 'Ringkasan & Ekstraksi Dokumen',
    description: 'Membaca file catatan, dokumen markdown, atau log untuk mengekstrak ringkasan eksekutif dan rekomendasi.',
    defaultRole: 'content',
    icon: 'FileText',
    promptTemplate:
      'Baca dan analisis seluruh file dokumen/teks lokal di atas. Buat ringkasan eksekutif yang padat, struktur poin penting, dan daftar rencana tindakan (action items) rekomendasi.',
  },
  {
    key: 'CUSTOM',
    name: 'Otomasi Kustom Mandiri',
    description: 'Menjalankan instruksi bebas buatan Owner terhadap file dan direktori lokal pilihan.',
    defaultRole: 'backend',
    icon: 'Sparkles',
    promptTemplate:
      'Analisis dan kerjakan tugas terhadap file lokal yang disediakan sesuai instruksi khusus dari Owner.',
  },
];

@Injectable()
export class AutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);

  // Penyimpanan konfigurasi otomasi (dalam memory / file)
  private automations: Map<string, AutomationConfig> = new Map();

  // Watcher instance untuk direktori lokal
  private activeWatchers: Map<string, { watcher: fs.FSWatcher; debounceTimer?: NodeJS.Timeout }> = new Map();

  // Riwayat eksekusi otomasi
  private runHistory: any[] = [];

  constructor(
    private readonly db: PrismaService,
    private readonly localFiles: LocalFilesService,
    private readonly presence: PresenceService,
    private readonly activityLog: ActivityLogService,
    @InjectQueue('office-tasks') private readonly taskQueue: Queue,
  ) {
    this.initDefaultAutomations();
  }

  onModuleDestroy() {
    this.stopAllWatchers();
  }

  private stopAllWatchers() {
    for (const [id, item] of this.activeWatchers.entries()) {
      try {
        if (item.debounceTimer) clearTimeout(item.debounceTimer);
        item.watcher.close();
        this.logger.log(`Folder watcher ${id} dihentikan`);
      } catch (e: any) {
        this.logger.warn(`Gagal menutup watcher ${id}: ${e.message}`);
      }
    }
    this.activeWatchers.clear();
  }

  private initDefaultAutomations() {
    const cwd = process.cwd().replace(/\\/g, '/');
    const defaultAuditId = 'auto-code-audit-default';
    this.automations.set(defaultAuditId, {
      id: defaultAuditId,
      name: 'Audit Kode Kantor AI Backend',
      recipeKey: 'CODE_AUDIT',
      targetDirectory: path.join(cwd, 'src').replace(/\\/g, '/'),
      filePatterns: ['*.ts'],
      isWatching: false,
      createdAt: new Date().toISOString(),
    });
  }

  getPresets(): AutomationPreset[] {
    return AUTOMATION_PRESETS;
  }

  getAutomations(): AutomationConfig[] {
    return Array.from(this.automations.values());
  }

  getHistory(): any[] {
    return this.runHistory.slice(-50).reverse();
  }

  /**
   * Menjalankan Otomasi Langsung (Quick Run)
   */
  async runAutomation(dto: RunAutomationDto) {
    const preset = AUTOMATION_PRESETS.find((p) => p.key === dto.recipeKey) || AUTOMATION_PRESETS[0];
    const targetDir = dto.targetDirectory || process.cwd();
    const normalizedDir = path.resolve(targetDir).replace(/\\/g, '/');

    this.logger.log(`[Otomasi] Menjalankan ${preset.name} pada direktori: ${normalizedDir}`);

    // 1. Dapatkan daftar agent aktif
    const activeAgents = await this.db.agent.findMany({ where: { active: true } });
    if (activeAgents.length === 0) {
      throw new BadRequestException('Tidak ada agen aktif di kantor untuk menjalankan otomasi.');
    }

    // Tentukan agent yang ditugaskan
    let assignedAgent = activeAgents[0];
    if (dto.agentId) {
      const explicit = activeAgents.find((a) => a.id === dto.agentId);
      if (explicit) assignedAgent = explicit;
    } else {
      const roleMatch = activeAgents.find(
        (a) =>
          a.role.toLowerCase().includes(preset.defaultRole) ||
          a.jobdesk.toLowerCase().includes(preset.defaultRole),
      );
      if (roleMatch) assignedAgent = roleMatch;
    }

    // 2. Baca file lokal
    let fileContextText = '';
    let readFilesList: string[] = [];

    if (dto.filePaths && dto.filePaths.length > 0) {
      // Baca file yang dipilih secara spesifik
      const multiRead = this.localFiles.readMultipleFiles(dto.filePaths, 100_000, 300);
      fileContextText = multiRead.formattedContext;
      readFilesList = multiRead.files.map((f) => f.name);
    } else {
      // Jika tidak ada file spesifik, scan direktori target dan ambil beberapa file relevan
      const explore = this.localFiles.explore(normalizedDir);
      const candidates = explore.items
        .filter((item) => !item.isDirectory && ['.ts', '.js', '.json', '.md', '.py'].includes(item.extension || ''))
        .slice(0, 6)
        .map((i) => i.path);

      if (candidates.length > 0) {
        const multiRead = this.localFiles.readMultipleFiles(candidates, 90_000, 250);
        fileContextText = multiRead.formattedContext;
        readFilesList = multiRead.files.map((f) => f.name);
      }

      // Tambahkan tree direktori sebagai pelengkap konteks
      const tree = this.localFiles.getDirectoryTree(normalizedDir, 2);
      fileContextText =
        `### 📁 Struktur Direktori Target: \`${normalizedDir}\`\n\`\`\`text\n${tree}\n\`\`\`\n\n` +
        fileContextText;
    }

    const dirBaseName = path.basename(normalizedDir);
    const taskTitle =
      dto.title || `[Otomasi] ${preset.name}: ${dirBaseName}`;

    // Susun instruksi komprehensif
    const userInstruction = dto.customPrompt && dto.customPrompt.trim()
      ? dto.customPrompt.trim()
      : preset.promptTemplate;

    const fullDescription = [
      `## 🤖 INSTRUKSI OTOMASI KANTOR AI`,
      `**Tipe Otomasi:** ${preset.name}`,
      `**Direktori Target:** \`${normalizedDir}\``,
      `**File yang Dianalisis:** ${readFilesList.length > 0 ? readFilesList.map((f) => `\`${f}\``).join(', ') : 'Struktur Direktori'}`,
      ``,
      `### Instruksi Kerja:`,
      userInstruction,
      ``,
      `=======================================================`,
      `### 📂 DATA SUMBER FILE LOKAL YANG TELAH DIBACA SISTEM:`,
      fileContextText,
      `=======================================================`,
    ].join('\n');

    // 3. Buat Goal pembungkus jika perlu
    const goal = await this.db.goal.create({
      data: {
        title: taskTitle,
        text: `Otomasi berjalan pada direktori ${normalizedDir} (${preset.name})`,
        status: 'IN_PROGRESS',
        createdBy: 'automation_system',
      },
    });

    // 4. Buat Task baru di database
    const task = await this.db.task.create({
      data: {
        agentId: assignedAgent.id,
        goalId: goal.id,
        title: taskTitle,
        description: fullDescription,
        acceptanceCriteria: [
          'Menganalisis isi file riil yang dibaca secara mendalam',
          'Memberikan solusi/deliverable lengkap yang siap pakai',
          'Mematuhi standar kualitas deliverable profesional',
        ],
        priority: 'HIGH',
        status: 'QUEUED',
      },
      include: { agent: true, goal: true },
    });

    // 5. Update presence dan broadcast SSE
    await this.presence.updatePresence(assignedAgent.id, {
      status: 'WORKING',
      location: 'DESK',
      currentTaskId: task.id,
      taskTitle: task.title,
      bubbleText: `🤖 Menjalankan otomasi: ${preset.name} (${dirBaseName})...`,
      bubbleType: 'THINKING',
    });

    this.presence.broadcastTaskUpdated({
      id: task.id,
      title: task.title,
      status: 'QUEUED',
      agentId: assignedAgent.id,
      priority: task.priority,
    });

    // 6. Masukkan ke BullMQ Queue
    await this.taskQueue.add(
      'process-task',
      { taskId: task.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    // 7. Simpan riwayat
    const historyItem = {
      id: `run-${Date.now()}`,
      taskId: task.id,
      goalId: goal.id,
      presetKey: preset.key,
      presetName: preset.name,
      agentName: assignedAgent.name,
      agentRole: assignedAgent.role,
      targetDirectory: normalizedDir,
      fileCount: readFilesList.length,
      startedAt: new Date().toISOString(),
      status: 'QUEUED',
    };
    this.runHistory.push(historyItem);

    await this.activityLog.log({
      eventType: 'TASK_LIFECYCLE',
      taskId: task.id,
      goalId: goal.id,
      agentId: assignedAgent.id,
      description: `[Otomasi Diluncurkan] Agen ${assignedAgent.name} menjalankan "${preset.name}" pada direktori ${normalizedDir}`,
      metadata: { targetDir: normalizedDir, files: readFilesList },
    });

    return {
      success: true,
      taskId: task.id,
      goalId: goal.id,
      assignedAgent: { id: assignedAgent.id, name: assignedAgent.name, role: assignedAgent.role },
      targetDirectory: normalizedDir,
      readFiles: readFilesList,
      message: `Otomasi "${preset.name}" berhasil diluncurkan dan sedang diproses oleh ${assignedAgent.name}!`,
    };
  }

  /**
   * Mengaktifkan atau menonaktifkan Folder Watcher (Live File Watcher)
   */
  async toggleWatcher(automationId: string, enable?: boolean): Promise<AutomationConfig> {
    const config = this.automations.get(automationId);
    if (!config) {
      throw new NotFoundException(`Otomasi ${automationId} tidak ditemukan`);
    }

    const shouldWatch = enable !== undefined ? enable : !config.isWatching;

    if (shouldWatch) {
      // Jalankan watcher
      if (!fs.existsSync(config.targetDirectory)) {
        throw new BadRequestException(`Direktori target tidak ditemukan: ${config.targetDirectory}`);
      }

      // Hentikan watcher lama jika ada
      this.stopWatcher(automationId);

      try {
        const watcher = fs.watch(
          config.targetDirectory,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return;
            // Abaikan file temporary atau node_modules
            if (
              filename.includes('node_modules') ||
              filename.includes('.git') ||
              filename.includes('dist') ||
              filename.endsWith('~')
            ) {
              return;
            }

            this.handleWatchedFileChange(automationId, filename);
          },
        );

        this.activeWatchers.set(automationId, { watcher });
        config.isWatching = true;
        this.logger.log(`[Folder Watcher] Aktif memantau direktori: ${config.targetDirectory}`);
      } catch (err: any) {
        this.logger.error(`Gagal memulai watcher: ${err.message}`);
        throw new BadRequestException(`Gagal memulai watcher: ${err.message}`);
      }
    } else {
      this.stopWatcher(automationId);
      config.isWatching = false;
    }

    return config;
  }

  private stopWatcher(automationId: string) {
    const existing = this.activeWatchers.get(automationId);
    if (existing) {
      if (existing.debounceTimer) clearTimeout(existing.debounceTimer);
      existing.watcher.close();
      this.activeWatchers.delete(automationId);
      this.logger.log(`[Folder Watcher] Dinonaktifkan untuk: ${automationId}`);
    }
  }

  /**
   * Debounced handler ketika file lokal berubah
   */
  private handleWatchedFileChange(automationId: string, filename: string) {
    const active = this.activeWatchers.get(automationId);
    const config = this.automations.get(automationId);
    if (!active || !config) return;

    if (active.debounceTimer) {
      clearTimeout(active.debounceTimer);
    }

    // Debounce 6 detik agar tidak memicu 20 kali saat user sedang mengetik
    active.debounceTimer = setTimeout(async () => {
      this.logger.log(
        `[Folder Watcher Trigger] Perubahan terdeteksi pada ${filename}. Memulai otomasi otomatis...`,
      );

      try {
        const filePath = path.join(config.targetDirectory, filename).replace(/\\/g, '/');
        const filesToProcess = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? [filePath] : [];

        await this.runAutomation({
          recipeKey: config.recipeKey,
          targetDirectory: config.targetDirectory,
          filePaths: filesToProcess,
          customPrompt: `Perubahan baru terdeteksi pada file \`${filename}\`. Lakukan pengecekan dan evaluasi otomatis.`,
          agentId: config.agentId,
          title: `[Watcher Otomatis] Evaluasi ${path.basename(filename)}`,
        });

        config.lastRunAt = new Date().toISOString();
      } catch (err: any) {
        this.logger.warn(`Gagal mengeksekusi watcher automation: ${err.message}`);
      }
    }, 6000);
  }

  /**
   * Menyimpan atau memperbarui konfigurasi otomasi
   */
  saveAutomation(dto: Partial<AutomationConfig>): AutomationConfig {
    const id = dto.id || `auto-${Date.now()}`;
    const existing = this.automations.get(id);

    const updated: AutomationConfig = {
      id,
      name: dto.name || existing?.name || 'Otomasi File Baru',
      recipeKey: dto.recipeKey || existing?.recipeKey || 'CODE_AUDIT',
      targetDirectory: dto.targetDirectory || existing?.targetDirectory || process.cwd(),
      filePatterns: dto.filePatterns || existing?.filePatterns || ['*.ts'],
      agentId: dto.agentId || existing?.agentId,
      customPrompt: dto.customPrompt || existing?.customPrompt,
      isWatching: existing?.isWatching || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    this.automations.set(id, updated);
    return updated;
  }

  deleteAutomation(id: string): { success: boolean } {
    this.stopWatcher(id);
    this.automations.delete(id);
    return { success: true };
  }
}
