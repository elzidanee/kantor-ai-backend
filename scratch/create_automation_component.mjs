import fs from 'fs';

const targetFile = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/components/AutomationSection.tsx';

const code = `import React, { useState, useEffect } from 'react';
import { Agent, Task, ExploreResult, FileItemInfo, ReadFileResult, AutomationPreset } from '../types';
import { api } from '../services/api';
import {
  Folder,
  FileCode,
  FileText,
  FileJson,
  FolderOpen,
  ArrowUp,
  Search,
  Play,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  BookOpen,
  Zap,
  Sparkles,
  Eye,
  Check,
  Radio,
  Clock,
  Layers,
  ExternalLink,
  ChevronRight,
  HardDrive,
  Copy,
  X,
  File
} from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

interface AutomationSectionProps {
  agents: Agent[];
  tasks: Task[];
  onRefresh: () => void;
  onInspectTask?: (task: Task) => void;
}

export const AutomationSection: React.FC<AutomationSectionProps> = ({
  agents,
  tasks,
  onRefresh,
  onInspectTask,
}) => {
  // Directory & Files State
  const [workspaces, setWorkspaces] = useState<{ name: string; path: string; description: string }[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [inputPath, setInputPath] = useState<string>('');
  const [exploreData, setExploreData] = useState<ExploreResult | null>(null);
  const [fileFilter, setFileFilter] = useState<string>('');
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // File Preview State
  const [previewFile, setPreviewFile] = useState<ReadFileResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Automation Presets & Configuration State
  const [presets, setPresets] = useState<AutomationPreset[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('CODE_AUDIT');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [runSuccessMessage, setRunSuccessMessage] = useState<string | null>(null);
  const [lastCreatedTaskId, setLastCreatedTaskId] = useState<string | null>(null);

  // Folder Watcher State
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isTogglingWatcher, setIsTogglingWatcher] = useState<boolean>(false);
  const [watchDebounceAlert, setWatchDebounceAlert] = useState<string | null>(null);

  // Load Workspaces & Presets on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [ws, pr] = await Promise.all([
        api.getWorkspaces(),
        api.getAutomationPresets(),
      ]);
      setWorkspaces(ws);
      setPresets(pr);

      // Default pilih direktori pertama (Backend)
      if (ws.length > 0) {
        handleExplore(ws[0].path);
      }
    } catch (err: any) {
      console.error('Failed to load initial automation data:', err);
    }
  };

  const handleExplore = async (pathToGo?: string) => {
    setIsLoadingFiles(true);
    try {
      const data = await api.exploreDirectory(pathToGo);
      setExploreData(data);
      setCurrentPath(data.currentPath);
      setInputPath(data.currentPath);
      setSelectedFilePaths([]); // Reset selected files saat pindah folder
    } catch (err: any) {
      alert('Gagal membuka direktori: ' + err.message);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handlePreview = async (filePath: string) => {
    setIsLoadingPreview(true);
    try {
      const data = await api.readFile(filePath, 400);
      setPreviewFile(data);
    } catch (err: any) {
      alert('Gagal membaca file: ' + err.message);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleToggleFileSelection = (filePath: string) => {
    setSelectedFilePaths((prev) =>
      prev.includes(filePath) ? prev.filter((p) => p !== filePath) : [...prev, filePath]
    );
  };

  const handleSelectAllCodeFiles = () => {
    if (!exploreData) return;
    const codeFiles = exploreData.items
      .filter((i) => !i.isDirectory && ['.ts', '.js', '.json', '.md', '.py', '.html', '.css'].includes(i.extension || ''))
      .map((i) => i.path);
    setSelectedFilePaths(codeFiles);
  };

  const handleClearSelection = () => {
    setSelectedFilePaths([]);
  };

  // Preset Selection
  const activePreset = presets.find((p) => p.key === selectedPresetKey) || presets[0];

  useEffect(() => {
    if (activePreset) {
      setCustomPrompt(activePreset.promptTemplate);
      // Auto select agent yang cocok dengan defaultRole preset jika ada
      const match = agents.find((a) =>
        a.role.toLowerCase().includes(activePreset.defaultRole) ||
        a.jobdesk.toLowerCase().includes(activePreset.defaultRole)
      );
      if (match) setSelectedAgentId(match.id);
      else if (agents.length > 0) setSelectedAgentId(agents[0].id);
    }
  }, [selectedPresetKey, presets, agents]);

  // Eksekusi Otomasi
  const handleRunAutomation = async () => {
    if (!currentPath) {
      alert('Pilih direktori terlebih dahulu!');
      return;
    }

    setIsRunningAutomation(true);
    setRunSuccessMessage(null);
    try {
      const result = await api.runQuickAutomation({
        recipeKey: selectedPresetKey,
        targetDirectory: currentPath,
        filePaths: selectedFilePaths.length > 0 ? selectedFilePaths : undefined,
        customPrompt,
        agentId: selectedAgentId || undefined,
      });

      setRunSuccessMessage(result.message);
      setLastCreatedTaskId(result.taskId);
      onRefresh(); // Refresh task list di App
    } catch (err: any) {
      alert('Gagal menjalankan otomasi: ' + err.message);
    } finally {
      setIsRunningAutomation(false);
    }
  };

  // Toggle Live Watcher
  const handleToggleWatcher = async () => {
    setIsTogglingWatcher(true);
    try {
      const defaultId = 'auto-code-audit-default';
      const nextState = !isWatching;
      await api.toggleAutomationWatcher(defaultId, nextState);
      setIsWatching(nextState);
      if (nextState) {
        setWatchDebounceAlert(
          \`Watcher Aktif: Folder \${currentPath.split('/').pop()} dipantau. Ketika file diubah dan disimpan, otomasi akan otomatis berjalan!\`
        );
      } else {
        setWatchDebounceAlert(null);
      }
    } catch (err: any) {
      alert('Gagal mengubah status watcher: ' + err.message);
    } finally {
      setIsTogglingWatcher(false);
    }
  };

  const copyFileContent = () => {
    if (!previewFile) return;
    navigator.clipboard.writeText(previewFile.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filter items
  const filteredItems = (exploreData?.items || []).filter((item) =>
    item.name.toLowerCase().includes(fileFilter.toLowerCase())
  );

  // Temukan tugas-tugas otomasi dari tasks global
  const automationTasks = tasks.filter((t) => t.title.startsWith('[Otomasi]') || t.title.startsWith('[Watcher]'));

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldCheck': return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'BookOpen': return <BookOpen className="w-4 h-4 text-purple-400" />;
      case 'CheckCircle2': return <CheckCircle2 className="w-4 h-4 text-pink-400" />;
      case 'Zap': return <Zap className="w-4 h-4 text-amber-400" />;
      case 'FileText': return <FileText className="w-4 h-4 text-cyan-400" />;
      default: return <Sparkles className="w-4 h-4 text-indigo-400" />;
    }
  };

  const getFileIcon = (item: FileItemInfo) => {
    if (item.isDirectory) return <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    const ext = item.extension || '';
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    }
    if (['.json', '.yaml', '.yml'].includes(ext)) {
      return <FileJson className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    }
    if (['.md', '.txt', '.doc'].includes(ext)) {
      return <FileText className="w-4 h-4 text-emerald-300 flex-shrink-0" />;
    }
    return <File className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ===================== BANNER & WORKSPACE BAR ===================== */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <HardDrive className="w-5 h-5" />
              </span>
              Otomasi File & Direktori Lokal
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              AI dapat membaca source code, dokumen, dan direktori lokal secara riil untuk analisis, audit keamanan, dokumentasi otomatis, dan testing.
            </p>
          </div>

          {/* Shortcut Tombol Workspace */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">Shortcut Proyek:</span>
            {workspaces.map((ws) => (
              <button
                key={ws.name}
                onClick={() => handleExplore(ws.path)}
                className={\`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 \${
                  currentPath === ws.path
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }\`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{ws.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Path Manual & Tombol Scan */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExplore(inputPath)}
              placeholder="Ketik path direktori lokal (contoh: D:/KANTOR AI ZIDANE/kantor-ai-backend/src)..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <button
            onClick={() => handleExplore(inputPath)}
            disabled={isLoadingFiles}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all flex items-center gap-2"
          >
            {isLoadingFiles ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Jelajahi Folder</span>
          </button>
        </div>

        {/* Breadcrumb Path & Parent Button */}
        {exploreData && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <span className="text-slate-500">Lokasi Aktif:</span>
              <span className="font-mono text-slate-200 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                {exploreData.currentPath}
              </span>
            </div>

            {exploreData.parentPath && (
              <button
                onClick={() => handleExplore(exploreData.parentPath!)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition-all"
              >
                <ArrowUp className="w-3 h-3 text-cyan-400" />
                <span>Naik Satu Level (..)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===================== TWO-COLUMN STUDIO ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ===================== LEFT: FILE EXPLORER & WATCHER (5 COLS) ===================== */}
        <div className="lg:col-span-5 space-y-4">
          {/* Watcher Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={\`w-2.5 h-2.5 rounded-full \${isWatching ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}\`} />
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    Folder Watcher Otomatis
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    {isWatching ? 'Memantau perubahan file secara realtime' : 'Watcher sedang nonaktif'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleWatcher}
                disabled={isTogglingWatcher}
                className={\`px-3 py-1.5 rounded-xl text-xs font-bold transition-all \${
                  isWatching
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                }\`}
              >
                {isTogglingWatcher ? 'Memproses...' : isWatching ? 'Nonaktifkan' : 'Aktifkan Watcher'}
              </button>
            </div>

            {watchDebounceAlert && (
              <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] leading-relaxed">
                {watchDebounceAlert}
              </div>
            )}
          </div>

          {/* File Explorer Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md flex flex-col h-[520px]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Daftar File Lokal</span>
                {exploreData && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                    {exploreData.items.length} item
                  </span>
                )}
              </div>

              {/* Selection Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSelectAllCodeFiles}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 hover:bg-slate-700"
                >
                  Pilih Semua Kode
                </button>
                {selectedFilePaths.length > 0 && (
                  <button
                    onClick={handleClearSelection}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 hover:bg-rose-900/60"
                  >
                    Reset ({selectedFilePaths.length})
                  </button>
                )}
              </div>
            </div>

            {/* Filter Search Input */}
            <div className="mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="Cari file dalam direktori ini..."
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
                />
              </div>
            </div>

            {/* File List Items */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {isLoadingFiles ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                  <RotateCcw className="w-5 h-5 animate-spin text-emerald-400" />
                  <span>Membaca isi direktori...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  <span>Tidak ada file yang cocok</span>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedFilePaths.includes(item.path);
                  return (
                    <div
                      key={item.path}
                      className={\`flex items-center justify-between p-2 rounded-xl text-xs transition-all \${
                        item.isDirectory
                          ? 'hover:bg-slate-800/80 cursor-pointer'
                          : isSelected
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : 'hover:bg-slate-800/50 border border-transparent'
                      }\`}
                    >
                      <div
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => {
                          if (item.isDirectory) {
                            handleExplore(item.path);
                          } else {
                            handleToggleFileSelection(item.path);
                          }
                        }}
                      >
                        {!item.isDirectory && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleFileSelection(item.path)}
                            className="rounded border-slate-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 w-3.5 h-3.5 cursor-pointer"
                          />
                        )}
                        {getFileIcon(item)}
                        <span className={\`truncate font-mono text-[11px] \${item.isDirectory ? 'font-bold text-slate-200' : 'text-slate-300'}\`}>
                          {item.name}
                        </span>
                        {item.isDirectory && item.itemCount !== undefined && (
                          <span className="text-[10px] text-slate-500 font-sans">
                            ({item.itemCount})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pl-2">
                        {!item.isDirectory && item.size !== undefined && (
                          <span className="text-[10px] font-mono text-slate-500">
                            {(item.size / 1024).toFixed(1)} KB
                          </span>
                        )}
                        {!item.isDirectory && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(item.path);
                            }}
                            title="Preview isi file"
                            className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-cyan-300 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.isDirectory && (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Files Footer Counter */}
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                File ditargetkan: <strong className="text-emerald-400 font-mono">{selectedFilePaths.length}</strong> file
              </span>
              <span className="text-[10px] text-slate-500">
                {selectedFilePaths.length === 0 ? 'Semua file kunci akan di-scan otomatis' : 'File terpilih akan diproses'}
              </span>
            </div>
          </div>
        </div>

        {/* ===================== RIGHT: AUTOMATION STUDIO (7 COLS) ===================== */}
        <div className="lg:col-span-7 space-y-4">
          {/* Preset Recipe Cards */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
            <h3 className="text-xs font-bold text-white flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Pilih Resep Otomasi AI
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {presets.map((preset) => {
                const isSelected = selectedPresetKey === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => setSelectedPresetKey(preset.key)}
                    className={\`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between \${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500/60 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50'
                    }\`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="p-1 rounded-lg bg-slate-900 border border-slate-800">
                        {getPresetIcon(preset.icon)}
                      </span>
                      <h4 className="text-xs font-bold text-slate-100 truncate">
                        {preset.name}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                      {preset.description}
                    </p>

                    {isSelected && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Automation Configuration & Trigger Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Konfigurasi Pengerjaan Tugas
              </h3>
              {selectedFilePaths.length > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedFilePaths.length} file khusus dilampirkan
                </span>
              )}
            </div>

            {/* Agent Assignee Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                Pilih Agen Pelaksana:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {agents.map((ag) => {
                  const isAgentSelected = selectedAgentId === ag.id;
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => setSelectedAgentId(ag.id)}
                      className={\`p-2 rounded-xl border text-left flex items-center gap-2 transition-all \${
                        isAgentSelected
                          ? 'bg-slate-800 border-cyan-500/60 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }\`}
                    >
                      <AgentAvatar role={ag.role} color={ag.color} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-200 truncate">{ag.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{ag.role}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Instruction Box */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                Instruksi Kerja (Bisa Disesuaikan):
              </label>
              <textarea
                rows={4}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Tulis instruksi khusus yang harus dilakukan AI terhadap file lokal..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 leading-relaxed font-sans"
              />
            </div>

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                onClick={handleRunAutomation}
                disabled={isRunningAutomation}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isRunningAutomation ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Mempersiapkan File & Meluncurkan Otomasi...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>🚀 Jalankan Otomasi Sekarang</span>
                  </>
                )}
              </button>
            </div>

            {/* Success notification with action */}
            {runSuccessMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{runSuccessMessage}</span>
                </div>
                {lastCreatedTaskId && (
                  <button
                    onClick={() => {
                      const t = tasks.find((item) => item.id === lastCreatedTaskId);
                      if (t && onInspectTask) onInspectTask(t);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px] hover:bg-emerald-400 flex items-center gap-1 flex-shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Lihat Task</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Automation Deliverables History */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Riwayat & Hasil Pengerjaan Otomasi
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {automationTasks.length} tugas otomasi
              </span>
            </div>

            {automationTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                Belum ada tugas otomasi yang dijalankan. Klik "Jalankan Otomasi Sekarang" di atas!
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                {automationTasks.slice(0, 10).map((task) => {
                  const isDone = task.status === 'DONE';
                  const isRunning = task.status === 'RUNNING';
                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={\`text-[9px] font-bold px-1.5 py-0.2 rounded \${
                              isDone
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : isRunning
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse'
                                : 'bg-slate-800 text-slate-400'
                            }\`}
                          >
                            {task.status}
                          </span>
                          <h4 className="text-xs font-bold text-slate-200 truncate">{task.title}</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-1">
                          Ditugaskan ke: <strong className="text-slate-300">{task.agent?.name} ({task.agent?.role})</strong>
                        </p>
                      </div>

                      {task.result && onInspectTask && (
                        <button
                          onClick={() => onInspectTask(task)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Hasil Deliverable</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================== FILE PREVIEW MODAL ===================== */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-white font-mono">{previewFile.name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono truncate max-w-lg">
                    {previewFile.path} • {previewFile.totalLines} baris • {(previewFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyFileContent}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-all"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Disalin!' : 'Salin Kode'}</span>
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Code Viewer */}
            <div className="flex-1 overflow-auto p-4 bg-[#070a13] font-mono text-xs text-slate-200 selection:bg-cyan-500/30">
              <pre className="leading-relaxed whitespace-pre font-mono">
                {previewFile.content}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>
                {previewFile.truncated ? '⚠️ File dipotong karena batas baris' : 'File ditampilkan utuh'}
              </span>
              <button
                onClick={() => {
                  if (!selectedFilePaths.includes(previewFile.path)) {
                    setSelectedFilePaths((prev) => [...prev, previewFile.path]);
                  }
                  setPreviewFile(null);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold"
              >
                Pilih File Ini untuk Otomasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Created AutomationSection.tsx successfully!');
