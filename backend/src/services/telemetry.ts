import type { UsageEvent, UsageWriter } from '../types/analytics.js';
import { logger } from '../utils/logger.js';

// One serial writer limits pressure on the pool; capacity includes the active write.
export class TelemetryService {
  private queue: UsageEvent[] = [];
  private running: Promise<void> | null = null;
  private closing = false;
  private failed = 0;
  private dropped = 0;
  private written = 0;
  constructor(private writer: UsageWriter | null, private capacity: number) {}

  record(event: UsageEvent): void {
    if (this.closing || !this.writer || this.queue.length + Number(!!this.running) >= this.capacity) {
      this.dropped++;
      return;
    }
    // Explicit whitelist: even accidental extra properties cannot retain conversations.
    this.queue.push({ requestId: event.requestId, timestamp: event.timestamp, model: event.model,
      durationMs: event.durationMs, statusCode: event.statusCode, outcome: event.outcome,
      errorCategory: event.errorCategory, promptTokens: event.promptTokens,
      completionTokens: event.completionTokens, totalTokens: event.totalTokens });
    this.startWorker();
  }

  private startWorker(): void {
    if (this.running || !this.queue.length) return;
    this.running = Promise.resolve().then(() => this.drain()).finally(() => {
      this.running = null;
      // Events may arrive after drain sees an empty queue but before this callback.
      this.startWorker();
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.length) {
      const event = this.queue.shift()!;
      try { await this.writer!.insert(event); this.written++; }
      catch {
        this.failed++;
        // Rate-bounded operational logging, with no driver error/SQL/parameters.
        if (this.failed === 1 || this.failed % 100 === 0) logger.warn('telemetry_write_failed', { failures: this.failed });
      }
    }
  }

  stats() { return { enabled: this.writer !== null, pending: this.queue.length + Number(!!this.running), written: this.written, failed: this.failed, dropped: this.dropped }; }
  async close(): Promise<void> {
    this.closing = true;
    while (this.running) await this.running;
  }
}
