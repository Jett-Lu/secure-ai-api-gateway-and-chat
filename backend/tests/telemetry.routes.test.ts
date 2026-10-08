import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryService } from '../src/services/telemetry.js';
import type { UsageEvent } from '../src/types/analytics.js';

Object.assign(process.env, { NODE_ENV: 'test', FRONTEND_ORIGIN: 'http://localhost:5173', UPSTREAM_API_URL: 'https://example.com/chat', UPSTREAM_MODEL: 'configured-model', RATE_LIMIT_MAX: '100', REQUEST_TIMEOUT_MS: '1000', UPSTREAM_TIMEOUT_MS: '2000' });
const { createApp } = await import('../src/app.js');
const payload = { apiKey: 'sk_private_key_123456789', messages: [{ role: 'user', content: 'private prompt' }] };
afterEach(() => vi.unstubAllGlobals());

describe('chat telemetry lifecycle', () => {
  it('records concurrent successful requests once and never persists secrets or content', async () => {
    const rows: UsageEvent[] = [];
    const telemetry = new TelemetryService({ insert: async row => { rows.push(row); } }, 50);
    const app = createApp({ telemetry });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: 'private reply' } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { 'content-type': 'application/json' } }));
    const responses = await Promise.all(Array.from({ length: 10 }, () => request(app).post('/api/chat').send(payload)));
    await telemetry.close();
    expect(responses.every(res => res.status === 200)).toBe(true);
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map(row => row.requestId)).size).toBe(10);
    expect(rows[0]).toMatchObject({ model: 'configured-model', totalTokens: 12, outcome: 'success', statusCode: 200 });
    expect(JSON.stringify(rows)).not.toMatch(/private|apiKey|messages|reply/);
  });
  it('records validation and upstream failures with sanitized categories', async () => {
    const rows: UsageEvent[] = [];
    const telemetry = new TelemetryService({ insert: async row => { rows.push(row); } }, 10);
    const app = createApp({ telemetry });
    vi.stubGlobal('fetch', async () => new Response('private provider error', { status: 401 }));
    expect((await request(app).post('/api/chat').send({ ...payload, messages: [] })).status).toBe(400);
    expect((await request(app).post('/api/chat').send(payload)).status).toBe(502);
    await telemetry.close();
    expect(rows.map(row => row.errorCategory)).toEqual(['validation_error', 'upstream_error']);
    expect(rows.every(row => row.totalTokens === null)).toBe(true);
  });
  it('preserves a valid reply during database failure and malformed usage', async () => {
    const telemetry = new TelemetryService({ insert: async () => { throw new Error('db down'); } }, 2);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 'oops' } }), { headers: { 'content-type': 'application/json' } }));
    const res = await request(createApp({ telemetry })).post('/api/chat').send(payload);
    await telemetry.close();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: 'ok', usage: {} });
    expect(telemetry.stats().failed).toBe(1);
  });
  it('records request timeout exactly once', async () => {
    const rows: UsageEvent[] = [];
    const telemetry = new TelemetryService({ insert: async row => { rows.push(row); } }, 10);
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const res = await request(createApp({ telemetry })).post('/api/chat').send(payload);
    await telemetry.close();
    expect(res.status).toBe(408);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ statusCode: 408, errorCategory: 'timeout_error', totalTokens: null });
  });
});
