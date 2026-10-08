import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface FileItemInfo {
  name: string;
  path: string;
  relativePath?: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  updatedAt?: string;
  itemCount?: number;
}

export interface ExploreResult {
  currentPath: string;
  parentPath: string | null;
  items: FileItemInfo[];
  totalDirs: number;
  totalFiles: number;
}

export interface ReadFileResult {
  path: string;
  name: string;
  extension: string;
  content: string;
  size: number;
  totalLines: number;
  truncated: boolean;
  isBinary: boolean;
}

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.gemini',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'package-lock.json',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp4',
  '.mp3',
  '.wav',
  '.exe',
  '.dll',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

@Injectable()
export class LocalFilesService {
  private readonly logger = new Logger(LocalFilesService.name);

  // Default roots yang sering diakses dalam workspace
  getWorkspaces(): { name: string; path: string; description: string }[] {
    const cwd = process.cwd();
    const parentDir = path.dirname(cwd);
    const backendPath = path.resolve(cwd);
    const frontendPath = path.resolve(parentDir, 'kantor-ai-frontend');

    return [
      {
        name: 'Kantor AI Backend',
        path: backendPath.replace(/\\/g, '/'),
        description: 'Source code backend NestJS, Prisma, BullMQ, dan Agent Logic',
      },
      {
        name: 'Kantor AI Frontend',
        path: frontendPath.replace(/\\/g, '/'),
        description: 'Source code frontend React, Vite, TailwindCSS, dan Stage 2D',
      },
      {
        name: 'Root Workspace',
        path: parentDir.replace(/\\/g, '/'),
        description: 'Folder utama proyek kantor-ai',
      },
    ];
  }

  /**
   * Menjelajahi file dan folder di direktori lokal
   */
  explore(targetPath?: string): ExploreResult {
    const rawPath = targetPath && targetPath.trim() ? targetPath.trim() : process.cwd();
    const normalized = path.resolve(rawPath);

    if (!fs.existsSync(normalized)) {
      throw new NotFoundException(`Direktori tidak ditemukan: ${rawPath}`);
    }

    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      throw new BadRequestException(`Path bukan direktori: ${rawPath}`);
    }

    const entries = fs.readdirSync(normalized, { withFileTypes: true });
    const items: FileItemInfo[] = [];

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;

      const fullPath = path.join(normalized, entry.name);
      const isDir = entry.isDirectory();
      const ext = isDir ? '' : path.extname(entry.name).toLowerCase();

      let size = 0;
      let updatedAt = '';
      let itemCount: number | undefined;

      try {
        const itemStat = fs.statSync(fullPath);
        size = itemStat.size;
        updatedAt = itemStat.mtime.toISOString();

        if (isDir) {
          try {
            const subEntries = fs.readdirSync(fullPath);
            itemCount = subEntries.filter((s) => !IGNORED_NAMES.has(s)).length;
          } catch {
            itemCount = 0;
          }
        }
      } catch {
        // Skip unreadable files
      }

      items.push({
        name: entry.name,
        path: fullPath.replace(/\\/g, '/'),
        isDirectory: isDir,
        size,
        extension: ext,
        updatedAt,
        itemCount,
      });
    }

    // Urutkan direktori di atas, lalu file secara abjad
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const parsedParent = path.dirname(normalized);
    const parentPath = parsedParent !== normalized ? parsedParent.replace(/\\/g, '/') : null;

    return {
      currentPath: normalized.replace(/\\/g, '/'),
      parentPath,
      items,
      totalDirs: items.filter((i) => i.isDirectory).length,
      totalFiles: items.filter((i) => !i.isDirectory).length,
    };
  }

  /**
   * Membaca isi satu file teks secara aman dengan pembatasan baris
   */
  readFileContent(filePath: string, maxLines = 500): ReadFileResult {
    const normalized = path.resolve(filePath);

    if (!fs.existsSync(normalized)) {
      throw new NotFoundException(`File tidak ditemukan: ${filePath}`);
    }

    const stat = fs.statSync(normalized);
    if (stat.isDirectory()) {
      throw new BadRequestException(`Path adalah direktori, bukan file: ${filePath}`);
    }

    const ext = path.extname(normalized).toLowerCase();
    const isBinary = BINARY_EXTENSIONS.has(ext);

    if (isBinary) {
      return {
        path: normalized.replace(/\\/g, '/'),
        name: path.basename(normalized),
        extension: ext,
        content: `[File biner / media (${ext}) - Ukuran: ${(stat.size / 1024).toFixed(1)} KB]`,
        size: stat.size,
        totalLines: 0,
        truncated: false,
        isBinary: true,
      };
    }

    // Hindari membaca file raksasa (> 4MB) langsung
    if (stat.size > 4 * 1024 * 1024) {
      return {
        path: normalized.replace(/\\/g, '/'),
        name: path.basename(normalized),
        extension: ext,
        content: `[File terlalu besar untuk dibaca langsung: ${(stat.size / (1024 * 1024)).toFixed(2)} MB. Maksimum 4 MB.]`,
        size: stat.size,
        totalLines: 0,
        truncated: true,
        isBinary: false,
      };
    }

    const rawContent = fs.readFileSync(normalized, 'utf8');
    const lines = rawContent.split(/\r?\n/);
    const totalLines = lines.length;

    let content = rawContent;
    let truncated = false;

    if (totalLines > maxLines) {
      content = lines.slice(0, maxLines).join('\n') + `\n\n... [Dipotong: hanya menampilkan ${maxLines} dari ${totalLines} baris] ...`;
      truncated = true;
    }

    return {
      path: normalized.replace(/\\/g, '/'),
      name: path.basename(normalized),
      extension: ext,
      content,
      size: stat.size,
      totalLines,
      truncated,
      isBinary: false,
    };
  }

  /**
   * Membaca kumpulan file yang dipilih dan menyusunnya menjadi konteks terstruktur
   */
  readMultipleFiles(
    filePaths: string[],
    maxTotalBytes = 120_000,
    maxLinesPerFile = 250,
  ): {
    files: ReadFileResult[];
    formattedContext: string;
    totalBytes: number;
  } {
    const results: ReadFileResult[] = [];
    let currentBytes = 0;
    const formattedBlocks: string[] = [];

    for (const fp of filePaths) {
      try {
        if (!fs.existsSync(fp)) continue;
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) continue;

        if (currentBytes + stat.size > maxTotalBytes) {
          formattedBlocks.push(`\n> [Peringatan: Batas kuota ukuran pembacaan file tercapai (${Math.round(maxTotalBytes / 1024)} KB). File selebihnya dilewati]`);
          break;
        }

        const res = this.readFileContent(fp, maxLinesPerFile);
        results.push(res);
        currentBytes += res.content.length;

        const lang = res.extension.replace('.', '') || 'text';
        formattedBlocks.push(
          `### 📄 File: \`${res.name}\`\n*Lokasi:* \`${res.path}\` (${res.totalLines} baris, ${(res.size / 1024).toFixed(1)} KB)\n\`\`\`${lang}\n${res.content}\n\`\`\``,
        );
      } catch (err: any) {
        this.logger.warn(`Gagal membaca file ${fp}: ${err.message}`);
      }
    }

    return {
      files: results,
      formattedContext: formattedBlocks.join('\n\n'),
      totalBytes: currentBytes,
    };
  }

  /**
   * Membuat representasi pohon direktori (Tree View)
   */
  getDirectoryTree(dirPath: string, maxDepth = 2, currentDepth = 0): string {
    const normalized = path.resolve(dirPath);
    if (!fs.existsSync(normalized)) return `[Direktori tidak ditemukan: ${dirPath}]`;

    const lines: string[] = [];
    const indent = '  '.repeat(currentDepth);

    try {
      const entries = fs.readdirSync(normalized, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name)) continue;

        const fullPath = path.join(normalized, entry.name);
        if (entry.isDirectory()) {
          lines.push(`${indent}📁 ${entry.name}/`);
          if (currentDepth < maxDepth) {
            lines.push(this.getDirectoryTree(fullPath, maxDepth, currentDepth + 1));
          }
        } else {
          lines.push(`${indent}📄 ${entry.name}`);
        }
      }
    } catch (err: any) {
      lines.push(`${indent}[Error membaca: ${err.message}]`);
    }

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Mendeteksi path file/folder yang mungkin disebut di dalam teks deskripsi task
   * dan otomatis membaca isi file atau strukturnya sebagai konteks prompt
   */
  detectAndExtractFileContext(text: string): string {
    if (!text) return '';

    const pathMatches: string[] = [];
    // Regex mencari pola path seperti:
    // d:/..., d:\..., C:/..., ./src/..., src/...
    const patterns = [
      /[a-zA-Z]:[\\/][^\s"'`\n<>]+/g,
      /(?:\.{1,2}[\\/]|[\\/]|src[\\/])[^\s"'`\n<>]+/g,
    ];

    for (const pat of patterns) {
      const found = text.match(pat);
      if (found) {
        for (const item of found) {
          // Bersihkan trailing punctuation jika ada
          const cleaned = item.replace(/[.,;:!?]+$/, '').trim();
          if (cleaned && !pathMatches.includes(cleaned)) {
            pathMatches.push(cleaned);
          }
        }
      }
    }

    if (pathMatches.length === 0) return '';

    const contextParts: string[] = [];
    let fileCount = 0;

    for (const rawCandidate of pathMatches) {
      if (fileCount >= 5) break; // Batasi maksimal 5 file otomatis agar token hemat

      // Coba resolve path relatif terhadap cwd jika belum absolut
      const resolved = path.isAbsolute(rawCandidate)
        ? rawCandidate
        : path.resolve(process.cwd(), rawCandidate);

      if (fs.existsSync(resolved)) {
        try {
          const stat = fs.statSync(resolved);
          if (stat.isDirectory()) {
            const tree = this.getDirectoryTree(resolved, 2);
            contextParts.push(
              `=== STRUKTUR DIREKTORI LOKAL DIBACA ===\nPath: ${resolved.replace(/\\/g, '/')}\n\`\`\`text\n${tree}\n\`\`\``,
            );
          } else if (stat.isFile()) {
            const fileData = this.readFileContent(resolved, 200);
            const lang = fileData.extension.replace('.', '') || 'text';
            contextParts.push(
              `=== ISI FILE LOKAL DIBACA: ${fileData.name} ===\nPath: ${fileData.path}\n\`\`\`${lang}\n${fileData.content}\n\`\`\``,
            );
            fileCount++;
          }
        } catch {
          // Lewati jika gagal membaca
        }
      }
    }

    if (contextParts.length === 0) return '';

    return (
      `\n\n=======================================================\n` +
      `🔍 [SISTEM KANTOR AI: KONTEKS FILE & DIREKTORI LOKAL]\n` +
      `Sistem otomatis membaca data riil dari sistem file lokal berikut:\n\n` +
      contextParts.join('\n\n') +
      `\n=======================================================\n`
    );
  }
}
