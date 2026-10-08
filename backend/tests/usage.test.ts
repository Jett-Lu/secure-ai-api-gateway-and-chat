import { describe, expect, it } from 'vitest';
import { normalizeUsage } from '../src/services/usage.js';
import { TelemetryService } from '../src/services/telemetry.js';

describe('usage accounting', () => {
  it('preserves measured zero and leaves missing counters unknown', () => {
    expect(normalizeUsage({ prompt_tokens: 0, total_tokens: 9 })).toEqual({ promptTokens: 0, completionTokens: null, totalTokens: 9 });
    expect(normalizeUsage(undefined)).toEqual({ promptTokens: null, completionTokens: null, totalTokens: null });
  });
  it('rejects malformed and inconsistent metrics without inventing totals', () => {
    expect(normalizeUsage({ prompt_tokens: -1, completion_tokens: '4', total_tokens: Infinity })).toEqual({ promptTokens: null, completionTokens: null, totalTokens: null });
    expect(normalizeUsage({ prompt_tokens: 2, completion_tokens: 3, total_tokens: 99 }).totalTokens).toBeNull();
    expect(normalizeUsage({ prompt_tokens: 2, completion_tokens: 3 }).totalTokens).toBeNull();
  });
});

describe('bounded background telemetry', () => {
  const event = { requestId: '00000000-0000-4000-8000-000000000001', timestamp: new Date(), model: 'test', durationMs: 1, statusCode: 200, outcome: 'success' as const, errorCategory: null, promptTokens: null, completionTokens: null, totalTokens: null };
  it('bounds outstanding writes, drains on shutdown, and rejects new events after closing', async () => {
    let finish!: () => void;
    const saved: unknown[] = [];
    const service = new TelemetryService({ insert: async e => { await new Promise<void>(r => { finish = r; }); saved.push(e); } }, 1);
    service.record(event);
    service.record(event);
    expect(service.stats().dropped).toBe(1);
    await new Promise(r => setImmediate(r));
    finish();
    await service.close();
    expect(saved).toHaveLength(1);
    service.record(event);
    expect(service.stats().pending).toBe(0);
  });
  it('contains persistence failures without unhandled rejection', async () => {
    const service = new TelemetryService({ insert: async () => { throw new Error('database password secret'); } }, 2);
    service.record(event);
    await service.close();
    expect(service.stats()).toMatchObject({ failed: 1, pending: 0 });
  });
  it('drains events arriving between an empty queue and worker completion', async () => {
    const saved: unknown[] = [];
    const service = new TelemetryService({ insert: async row => { saved.push(row); } }, 10);
    service.record(event);
    await Promise.resolve();
    await Promise.resolve();
    service.record(event);
    await service.close();
    expect(saved).toHaveLength(2);
    expect(service.stats().pending).toBe(0);
  });
});
