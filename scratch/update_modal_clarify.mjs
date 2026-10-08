import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/components/TaskOutputModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update interface TaskOutputModalProps
const targetProps = `interface TaskOutputModalProps {
  task: Task | null;
  onClose: () => void;
  onApprove?: (taskId: string) => Promise<void>;
  onRevise?: (taskId: string, feedback: string) => Promise<void>;
}`;

const replaceProps = `interface TaskOutputModalProps {
  task: Task | null;
  onClose: () => void;
  onApprove?: (taskId: string) => Promise<void>;
  onRevise?: (taskId: string, feedback: string) => Promise<void>;
  onClarify?: (taskId: string, answer: string) => Promise<void>;
}`;

content = content.replace(targetProps, replaceProps);

// 2. Update props destructuring & states
const targetFn = `export const TaskOutputModal: React.FC<TaskOutputModalProps> = ({
  task,
  onClose,
  onApprove,
  onRevise,
}) => {
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [showReviseBox, setShowReviseBox] = useState<boolean>(false);
  const [reviseNotes, setReviseNotes] = useState<string>('');
  const [isSubmittingRevise, setIsSubmittingRevise] = useState<boolean>(false);`;

const replaceFn = `export const TaskOutputModal: React.FC<TaskOutputModalProps> = ({
  task,
  onClose,
  onApprove,
  onRevise,
  onClarify,
}) => {
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [showReviseBox, setShowReviseBox] = useState<boolean>(false);
  const [reviseNotes, setReviseNotes] = useState<string>('');
  const [isSubmittingRevise, setIsSubmittingRevise] = useState<boolean>(false);
  const [showClarifyBox, setShowClarifyBox] = useState<boolean>(false);
  const [clarifyAnswer, setClarifyAnswer] = useState<string>('');
  const [isSubmittingClarify, setIsSubmittingClarify] = useState<boolean>(false);

  const handleClarifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onClarify || !clarifyAnswer.trim() || !task) return;
    try {
      setIsSubmittingClarify(true);
      await onClarify(task.id, clarifyAnswer.trim());
      setShowClarifyBox(false);
      setClarifyAnswer('');
      onClose();
    } catch (e: any) {
      alert(\`Gagal mengirim klarifikasi: \${e.message}\`);
    } finally {
      setIsSubmittingClarify(false);
    }
  };`;

content = content.replace(targetFn, replaceFn);

// 3. Add Clarification Banner right under Prompt in modal body
const targetPromptEnd = `            {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
              <div className="pl-7 pt-1 flex flex-wrap gap-1.5">
                {task.acceptanceCriteria.map((c, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>`;

const replacePromptEnd = `            {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
              <div className="pl-7 pt-1 flex flex-wrap gap-1.5">
                {task.acceptanceCriteria.map((c, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* BANNER KLARIFIKASI DARI OWNER JIKA TASK TERKENDALA / BUTUH INFO */}
          {(task.status === 'BLOCKED' || task.status === 'REVIEW' || (task.outputEnvelope?.open_questions && task.outputEnvelope.open_questions.length > 0)) && (
            <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-slate-900/90 p-4 sm:p-5 flex flex-col gap-3 shadow-lg animate-fadeIn">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs sm:text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span>{task.status === 'BLOCKED' ? 'Tugas Terkendala — Butuh Klarifikasi Owner' : 'Agen Membutuhkan Arahan / Klarifikasi Tambahan'}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 font-bold">
                  AKSI DIPERLUKAN
                </span>
              </div>

              <p className="text-xs text-slate-300">
                Agen <strong>{agentName}</strong> membutuhkan informasi tambahan berikut agar tugas dapat langsung berjalan kembali:
              </p>

              {task.outputEnvelope?.open_questions && task.outputEnvelope.open_questions.length > 0 && (
                <ul className="text-xs text-amber-200/90 list-disc list-inside space-y-1 bg-black/30 p-3 rounded-xl border border-amber-500/20 font-sans">
                  {task.outputEnvelope.open_questions.map((q: string, idx: number) => (
                    <li key={idx} className="leading-relaxed">{q}</li>
                  ))}
                </ul>
              )}

              {task.error && (
                <div className="text-xs text-rose-300 bg-rose-950/30 p-2.5 rounded-xl border border-rose-800/30 font-mono">
                  Kendala: {task.error}
                </div>
              )}

              {/* Formulir Klarifikasi Langsung di Modal */}
              <form onSubmit={handleClarifySubmit} className="flex flex-col gap-2.5 mt-1">
                <textarea
                  value={clarifyAnswer}
                  onChange={(e) => setClarifyAnswer(e.target.value)}
                  placeholder="Tuliskan klarifikasi, instruksi spesifik, atau data yang dibutuhkan agen di sini..."
                  rows={3}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white focus:outline-none focus:border-amber-400 font-sans resize-none shadow-inner"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingClarify || !clarifyAnswer.trim()}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isSubmittingClarify ? 'Mengirim & Menjalankan...' : 'Kirim Klarifikasi & Jalankan Lagi 🚀'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}`;

content = content.replace(targetPromptEnd, replacePromptEnd);

// 4. Update status badge in header to support BLOCKED
const targetStatusBadge = `                  className={\`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border \${
                    task.status === 'DONE'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : task.status === 'REVIEW'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                  }\`}
                >
                  {task.status === 'DONE' ? '✓ SELESAI' : task.status === 'REVIEW' ? '⚠ BUTUH REVIEW' : task.status}`;

const replaceStatusBadge = `                  className={\`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border \${
                    task.status === 'DONE'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : task.status === 'BLOCKED'
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
                      : task.status === 'REVIEW'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                  }\`}
                >
                  {task.status === 'DONE' ? '✓ SELESAI' : task.status === 'BLOCKED' ? '⚠ TERKENDALA (BUTUH KLARIFIKASI)' : task.status === 'REVIEW' ? '⚠ BUTUH REVIEW / KLARIFIKASI' : task.status}`;

content = content.replace(targetStatusBadge, replaceStatusBadge);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated TaskOutputModal.tsx with Clarification UI & Handler!');
