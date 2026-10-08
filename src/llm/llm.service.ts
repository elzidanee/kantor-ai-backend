import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Parsed = { text: string; model: string; usage?: any; finish?: string };
export type LlmResult = Parsed & { attempts: number };

@Injectable()
export class LlmService {
  private log = new Logger(LlmService.name);
  constructor(private config: ConfigService) {}

  async chat(system: string, user: string, maxAttempts = 3): Promise<LlmResult> {
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = await this.call(system, user);
        const p = raw.trimStart().startsWith('data:') ? this.fromStream(raw) : this.fromJson(raw);
        if (p.text.trim() && p.finish !== 'in_progress') return { ...p, attempts: attempt };
        lastError = `Jawaban kosong atau belum selesai (model=${p.model}, finish=${p.finish}). Mentah: ${raw.slice(0, 400)}`;
      } catch (e: any) {
        lastError = String(e.message);
      }
      this.log.warn(`Percobaan ${attempt}/${maxAttempts} gagal: ${lastError.slice(0, 300)}`);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
    throw new Error(lastError);
  }

  private async call(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.config.get('ROUTER_BASE_URL')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get('ROUTER_API_KEY')}`,
      },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: this.config.get('ROUTER_MODEL'),
        stream: false,
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Router ${res.status}: ${raw.slice(0, 300)}`);
    return raw;
  }

  private fromJson(raw: string): Parsed {
    const d = JSON.parse(raw);
    const c = d.choices?.[0];
    return { text: c?.message?.content ?? '', model: d.model ?? '', usage: d.usage, finish: c?.finish_reason };
  }

  private fromStream(raw: string): Parsed {
    let text = '', model = '', finish: string | undefined, usage: any;
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      const c = JSON.parse(line.slice(6));
      model = c.model ?? model;
      text += c.choices?.[0]?.delta?.content ?? '';
      finish = c.choices?.[0]?.finish_reason ?? finish;
      usage = c.usage ?? usage;
    }
    return { text, model, usage, finish };
  }
}