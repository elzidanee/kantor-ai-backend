import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject, Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SsePayload {
  type: 'office.status' | 'agent.presence' | 'task.updated' | 'run.finished' | 'ping';
  data: any;
}

@Injectable()
export class PresenceBroadcaster {
  private readonly logger = new Logger(PresenceBroadcaster.name);
  private readonly events$ = new Subject<SsePayload>();

  broadcast(type: SsePayload['type'], data: any) {
    this.events$.next({ type, data });
  }

  getStream(initialEvents: SsePayload[] = []): Observable<MessageEvent> {
    // 1. Initial snapshot stream
    const snapshot$ = new Observable<SsePayload>((subscriber) => {
      for (const ev of initialEvents) {
        subscriber.next(ev);
      }
      subscriber.complete();
    });

    // 2. Heartbeat ping setiap 25 detik agar koneksi HTTP SSE tidak diputus oleh proxy / browser
    const heartbeat$ = interval(25_000).pipe(
      map(() => ({
        type: 'ping' as const,
        data: { timestamp: new Date().toISOString() },
      })),
    );

    // 3. Gabungkan snapshot awal, event broadcast realtime, dan heartbeat
    return merge(snapshot$, this.events$, heartbeat$).pipe(
      map((item) => ({
        type: item.type,
        data: item.data,
      })),
    );
  }
}
