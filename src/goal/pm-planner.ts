import { GoalPlanResult, GoalTriageResult, PlanTaskItem } from './goal.interface.js';

/**
 * Validasi rencana tugas dari PM sesuai aturan logicagent.md Bagian 4.3:
 * - Tidak boleh ada siklus dependensi (cycle detection).
 * - depends_on harus menunjuk kunci yang valid.
 * - Setiap tugas wajib memiliki acceptance_criteria minimal 1.
 * - Maksimal 12 tugas per target.
 */
export function validateGoalPlan(tasks: PlanTaskItem[]): { valid: boolean; error?: string } {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { valid: false, error: 'Daftar tugas dalam rencana kosong.' };
  }

  if (tasks.length > 12) {
    return { valid: false, error: 'Jumlah tugas melebihi batas maksimal 12 tugas per target.' };
  }

  const keySet = new Set<string>();
  for (const t of tasks) {
    if (!t.key || typeof t.key !== 'string') {
      return { valid: false, error: 'Setiap tugas wajib memiliki atribut key (contoh: T1, T2).' };
    }
    if (keySet.has(t.key)) {
      return { valid: false, error: `Kunci tugas duplikat ditemukan: ${t.key}` };
    }
    keySet.add(t.key);

    if (!t.title || !t.role || !t.description) {
      return { valid: false, error: `Tugas ${t.key} memiliki field title, role, atau description yang kosong.` };
    }

    if (!Array.isArray(t.acceptance_criteria) || t.acceptance_criteria.length === 0) {
      return { valid: false, error: `Tugas ${t.key} wajib memiliki minimal satu kriteria penerimaan.` };
    }
  }

  // Cek validitas relasi depends_on
  for (const t of tasks) {
    const deps = t.depends_on || [];
    for (const dep of deps) {
      if (dep === t.key) {
        return { valid: false, error: `Tugas ${t.key} tidak boleh bergantung pada dirinya sendiri.` };
      }
      if (!keySet.has(dep)) {
        return { valid: false, error: `Tugas ${t.key} bergantung pada kunci yang tidak ada: ${dep}` };
      }
    }
  }

  // Deteksi siklus dependensi menggunakan DFS (0 = unvisited, 1 = visiting, 2 = visited)
  const adjList = new Map<string, string[]>();
  for (const t of tasks) {
    adjList.set(t.key, t.depends_on || []);
  }

  const state = new Map<string, number>();
  for (const k of keySet) {
    state.set(k, 0);
  }

  function hasCycle(node: string): boolean {
    state.set(node, 1); // sedang dikunjungi dalam branch ini

    const neighbors = adjList.get(node) || [];
    for (const next of neighbors) {
      const s = state.get(next) ?? 0;
      if (s === 1) return true; // cycle detected!
      if (s === 0 && hasCycle(next)) return true;
    }

    state.set(node, 2); // selesai dikunjungi
    return false;
  }

  for (const k of keySet) {
    if (state.get(k) === 0) {
      if (hasCycle(k)) {
        return { valid: false, error: `Terdeteksi siklus dependensi melingkar yang melibatkan kunci ${k}.` };
      }
    }
  }

  return { valid: true };
}

/**
 * Prompt Triage Intake PM (logicagent.md Bagian 3)
 */
export function buildTriagePrompt(goalText: string, activeAgents: { name: string; role: string; jobdesk: string }[]) {
  const agentListText = activeAgents
    .map((a) => `- ${a.name} (${a.role}): ${a.jobdesk}`)
    .join('\n');

  return {
    systemPrompt: `Kamu adalah Dewi, Project Manager di Kantor AI.
Tugasmu adalah melakukan Triage Intake terhadap target atau permintaan Owner.

KATEGORI TRIAGE:
- STATUS_QUERY: Owner hanya bertanya status ("sudah sampai mana?")
- SINGLE_TASK: Target sederhana yang bisa diselesaikan satu peran saja
- MULTI_TASK: Target yang membutuhkan kolaborasi beberapa peran secara berurutan atau paralel
- AMBIGUOUS: Informasi inti belum jelas, perlu klarifikasi (nama produk, tujuan utama, atau batasan kritis)
- OUT_OF_SCOPE: Di luar kemampuan kantor (akses produksi, bayar iklan nyata, kirim email fisik)
- UNSAFE: Berbahaya, ilegal, atau melanggar etika

DAFTAR AGENT AKTIF DI KANTOR:
${agentListText}

ATURAN KLARIFIKASI:
- Hanya pilih AMBIGUOUS jika informasi benar-benar vital tidak diketahui.
- Maksimal 3 pertanyaan klarifikasi, bernomor dan to-the-point.
- Jika bisa diasumsikan dengan aman, pilih MULTI_TASK atau SINGLE_TASK dengan asumsi tertulis.

FORMAT KELUARAN WAJIB:
Balas HANYA dengan SATU objek JSON tanpa markdown dan tanpa teks pembuka/penutup:
{
  "category": "SINGLE_TASK" | "MULTI_TASK" | "AMBIGUOUS" | "STATUS_QUERY" | "OUT_OF_SCOPE" | "UNSAFE",
  "summary": "Ringkasan target 1 kalimat",
  "roles_needed": ["FRONTEND", "BACKEND", "QA", dll],
  "missing_info": ["info penting jika ada"],
  "risk": "LOW" | "MEDIUM" | "HIGH",
  "needs_owner_approval_before_start": false,
  "clarification_questions": ["Pertanyaan 1 jika AMBIGUOUS"]
}`,
    userPrompt: `Teks Target Owner:\n"${goalText}"`,
  };
}

/**
 * Prompt Dekomposisi Target Menjadi Tugas (logicagent.md Bagian 4)
 */
export function buildDecompositionPrompt(
  goalText: string,
  activeAgents: { name: string; role: string; jobdesk: string }[],
  clarificationAnswer?: string,
) {
  const agentListText = activeAgents
    .map((a) => `- ${a.name} (Role: ${a.role}): ${a.jobdesk}`)
    .join('\n');

  return {
    systemPrompt: `Kamu adalah Dewi, Project Manager di Kantor AI.
Tugasmu adalah memecah target Owner menjadi rencana kerja terstruktur (tasks).

DAFTAR AGENT AKTIF DI KANTOR:
${agentListText}

PRINSIP PEMECAHAN TUGAS:
1. Satu tugas, satu penanggung jawab peran, satu keluaran jelas.
2. Tugas yang saling bebas dibuat paralel (depends_on: []).
3. Hanya beri depends_on jika memang membutuhkan deliverable dari tugas lain.
4. Sertakan tugas pengujian QA (Sinta) jika ada tugas pemrograman atau copywriting yang butuh verifikasi.
5. Gunakan format kunci T1, T2, T3, dst.
6. Maksimal 12 tugas.
7. Setiap tugas WAJIB memiliki acceptance_criteria (minimal 1-3 kriteria terukur).

FORMAT KELUARAN WAJIB:
Balas HANYA dengan SATU objek JSON tanpa markdown:
{
  "goal_summary": "Ringkasan sasaran target",
  "assumptions": ["Asumsi teknis atau bisnis yang digunakan"],
  "tasks": [
    {
      "key": "T1",
      "title": "Judul tugas singkat",
      "role": "CONTENT",
      "description": "Deskripsi instruksi kerja yang jelas",
      "acceptance_criteria": ["Kriteria 1", "Kriteria 2"],
      "deliverable": "TEXT" | "CODE" | "CONFIG",
      "depends_on": [],
      "priority": "NORMAL"
    },
    {
      "key": "T2",
      "title": "Membangun tampilan",
      "role": "FRONTEND",
      "description": "Implementasi UI berdasarkan konten dari T1",
      "acceptance_criteria": ["Responsif", "Clean code"],
      "deliverable": "CODE",
      "depends_on": ["T1"],
      "priority": "NORMAL"
    }
  ]
}`,
    userPrompt: `Target Owner: "${goalText}"${
      clarificationAnswer ? `\nJawaban Klarifikasi Owner: "${clarificationAnswer}"` : ''
    }`,
  };
}
