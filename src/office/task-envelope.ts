export interface Deliverable {
  type: 'CODE' | 'TEXT' | 'CONFIG' | 'OTHER';
  name: string;
  content: string;
}

export interface CriterionCheck {
  criterion: string;
  met: boolean;
  note?: string;
}

export interface Handoff {
  to_role?: string;
  note?: string;
}

export interface AgentEnvelope {
  status: 'DONE' | 'NEEDS_INFO' | 'BLOCKED' | 'CANNOT_DO';
  summary: string;
  deliverables: Deliverable[];
  criteria_check: CriterionCheck[];
  assumptions: string[];
  open_questions: string[];
  handoff?: Handoff;
  confidence: number;
}

export function parseAgentEnvelope(text: string): AgentEnvelope {
  try {
    // 1. Cari kurung kurawal pertama dan terakhir untuk mengekstrak objek JSON
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1 || e <= s) {
      throw new Error('Objek JSON tidak ditemukan dalam respon model');
    }

    const rawJson = text.slice(s, e + 1);
    const j = JSON.parse(rawJson);

    // 2. Normalisasi status
    let status: AgentEnvelope['status'] = 'DONE';
    if (j.status === 'NEEDS_INFO' || j.status === 'BLOCKED' || j.status === 'CANNOT_DO') {
      status = j.status;
    }

    // 3. Normalisasi deliverables
    const deliverables: Deliverable[] = Array.isArray(j.deliverables)
      ? j.deliverables.map((d: any) => ({
          type: ['CODE', 'TEXT', 'CONFIG'].includes(d.type) ? d.type : 'TEXT',
          name: String(d.name ?? 'output.txt'),
          content: String(d.content ?? ''),
        }))
      : [];

    // Jika deliverables kosong tapi ada result atau summary, buat default deliverable
    if (deliverables.length === 0 && (j.result || j.summary)) {
      deliverables.push({
        type: 'TEXT',
        name: 'hasil.txt',
        content: String(j.result ?? j.summary ?? ''),
      });
    }

    // 4. Normalisasi criteria check
    const criteria_check: CriterionCheck[] = Array.isArray(j.criteria_check)
      ? j.criteria_check.map((c: any) => ({
          criterion: String(c.criterion ?? ''),
          met: Boolean(c.met !== false),
          note: c.note ? String(c.note) : undefined,
        }))
      : [];

    return {
      status,
      summary: String(j.summary ?? j.result ?? 'Pekerjaan selesai'),
      deliverables,
      criteria_check,
      assumptions: Array.isArray(j.assumptions) ? j.assumptions.map(String) : [],
      open_questions: Array.isArray(j.open_questions)
        ? j.open_questions.map(String)
        : Array.isArray(j.questions)
          ? j.questions.map(String)
          : [],
      handoff: j.handoff
        ? {
            to_role: j.handoff.to_role ? String(j.handoff.to_role) : undefined,
            note: j.handoff.note ? String(j.handoff.note) : undefined,
          }
        : undefined,
      confidence: typeof j.confidence === 'number' ? Math.max(0, Math.min(1, j.confidence)) : 0.8,
    };
  } catch {
    // Fallback jika respon model tidak menghasilkan JSON
    return {
      status: 'DONE',
      summary: text.slice(0, 160).trim(),
      deliverables: [
        {
          type: 'TEXT',
          name: 'jawaban_mentah.txt',
          content: text.trim(),
        },
      ],
      criteria_check: [],
      assumptions: ['Respon tidak dalam format JSON amplop standar, teks mentah disimpan'],
      open_questions: [],
      confidence: 0.5,
    };
  }
}
