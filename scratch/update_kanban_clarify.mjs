import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/components/KanbanBoard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add HelpCircle, X to lucide-react imports if not there
if (!content.includes('HelpCircle,')) {
  content = content.replace("RotateCcw,", "RotateCcw,\n  HelpCircle,\n  X,");
}

// 2. Add clarifying state
const targetState = `  const [revisingTaskId, setRevisingTaskId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');`;

const replaceState = `  const [revisingTaskId, setRevisingTaskId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [clarifyingTask, setClarifyingTask] = useState<Task | null>(null);
  const [clarifyAnswerText, setClarifyAnswerText] = useState('');
  const [isSubmittingClarify, setIsSubmittingClarify] = useState(false);

  const handleClarifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarifyingTask || !clarifyAnswerText.trim() || isSubmittingClarify) return;
    try {
      setIsSubmittingClarify(true);
      await api.clarifyTask(clarifyingTask.id, clarifyAnswerText.trim());
      setClarifyingTask(null);
      setClarifyAnswerText('');
      onRefresh();
    } catch (err: any) {
      alert(\`Gagal mengirim klarifikasi: \${err.message}\`);
    } finally {
      setIsSubmittingClarify(false);
    }
  };`;

content = content.replace(targetState, replaceState);

// 3. In Board view: update action buttons for BLOCKED & REVIEW
const targetReviewActions = `                        {/* Action buttons if in REVIEW */}
                        {task.status === 'REVIEW' && (
                          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80">
                            <button
                              onClick={(e) => handleApprove(task.id, e)}
                              className="flex-1 py-1 px-2 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 shadow-sm transition-all"
                            >
                              <Check className="w-3 h-3" />
                              Setujui
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevisingTaskId(task.id);
                              }}
                              className="flex-1 py-1 px-2 rounded-lg text-[11px] font-bold bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/40 flex items-center justify-center gap-1 transition-all"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revisi
                            </button>
                          </div>
                        )}`;

const replaceReviewActions = `                        {/* Action buttons if BLOCKED (Unblock Flow) */}
                        {task.status === 'BLOCKED' && (
                          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
                            <div className="text-[10px] text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg px-2 py-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0 text-rose-400" />
                              <span className="truncate">Terkendala: Butuh info Owner</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setClarifyingTask(task);
                              }}
                              className="w-full py-1.5 px-2 rounded-lg text-[11px] font-bold bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02] cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Beri Klarifikasi & Jalankan Lagi</span>
                            </button>
                          </div>
                        )}

                        {/* Action buttons if in REVIEW */}
                        {task.status === 'REVIEW' && (
                          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80">
                            <button
                              onClick={(e) => handleApprove(task.id, e)}
                              className="flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 shadow-sm transition-all"
                              title="Setujui hasil kerja ini"
                            >
                              <Check className="w-3 h-3" />
                              Setujui
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setClarifyingTask(task);
                              }}
                              className="flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold bg-cyan-600/25 hover:bg-cyan-600 text-cyan-200 hover:text-white border border-cyan-500/40 flex items-center justify-center gap-1 transition-all"
                              title="Beri klarifikasi arahan agar agen melanjutkan"
                            >
                              <HelpCircle className="w-3 h-3" />
                              Klarifikasi
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevisingTaskId(task.id);
                              }}
                              className="flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/40 flex items-center justify-center gap-1 transition-all"
                              title="Minta revisi"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revisi
                            </button>
                          </div>
                        )}`;

content = content.replace(targetReviewActions, replaceReviewActions);

// 4. In List view: add Klarifikasi button
const targetTableActions = `                            {task.status === 'REVIEW' && (
                              <button
                                onClick={(e) => handleApprove(task.id, e)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-sm"
                              >
                                <Check className="w-3 h-3" />
                                <span>Setujui</span>
                              </button>
                            )}`;

const replaceTableActions = `                            {(task.status === 'BLOCKED' || task.status === 'REVIEW') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClarifyingTask(task);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500 hover:text-slate-950 text-xs font-bold transition-all inline-flex items-center gap-1"
                              >
                                <HelpCircle className="w-3 h-3" />
                                <span>Klarifikasi</span>
                              </button>
                            )}
                            {task.status === 'REVIEW' && (
                              <button
                                onClick={(e) => handleApprove(task.id, e)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-sm"
                              >
                                <Check className="w-3 h-3" />
                                <span>Setujui</span>
                              </button>
                            )}`;

content = content.replace(targetTableActions, replaceTableActions);

// 5. Add Modal Dialog Klarifikasi Task at the end before closing tag
const targetEnd = `      {/* ======================================================== */}
      {/* 4. MODAL DIALOG REVISI OWNER                             */}
      {/* ======================================================== */}
      {revisingTaskId && (`;

const replaceEnd = `      {/* ======================================================== */}
      {/* 4. MODAL DIALOG KLARIFIKASI TASK OWNER (AGAR JALAN LAGI) */}
      {/* ======================================================== */}
      {clarifyingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-[#090e1d] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Klarifikasi Tugas untuk {clarifyingTask.agent?.name || 'Agen'}</h3>
                  <p className="text-[11px] text-slate-400">Tugas akan langsung dimasukkan antrean & berjalan kembali</p>
                </div>
              </div>
              <button
                onClick={() => setClarifyingTask(null)}
                className="p-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 p-3.5 flex flex-col gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase text-cyan-400">Judul Tugas:</span>
              <h4 className="text-xs font-bold text-slate-200">{clarifyingTask.title}</h4>
              {clarifyingTask.outputEnvelope?.open_questions && clarifyingTask.outputEnvelope.open_questions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-900">
                  <span className="text-[10px] font-bold text-amber-400">Pertanyaan / Kebutuhan Agen:</span>
                  <ul className="text-xs text-amber-200/90 list-disc list-inside mt-1 space-y-0.5">
                    {clarifyingTask.outputEnvelope.open_questions.map((q: string, idx: number) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <form onSubmit={handleClarifySubmit} className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-slate-300">
                Jawaban / Klarifikasi Arahan dari Owner:
              </label>
              <textarea
                value={clarifyAnswerText}
                onChange={(e) => setClarifyAnswerText(e.target.value)}
                placeholder="Tuliskan arahan, jawaban atas pertanyaan agen, atau data spesifik yang dibutuhkan..."
                rows={4}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-3.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans resize-none shadow-inner"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClarifyingTask(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClarify || !clarifyAnswerText.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSubmittingClarify ? 'Mengirim & Menjalankan...' : 'Kirim Klarifikasi & Jalankan Lagi 🚀'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL DIALOG REVISI OWNER                             */}
      {/* ======================================================== */}
      {revisingTaskId && (`;

content = content.replace(targetEnd, replaceEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated KanbanBoard.tsx with Clarification UI & Unblock Flow!');
