import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { UsageRepository } from '../src/repositories/usageRepository.js';
import { TelemetryService } from '../src/services/telemetry.js';
import type { AnalyticsFilter, UsageEvent } from '../src/types/analytics.js';

// Use only a disposable database: migrations alter its schema; test rows are cleaned up.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('real PostgreSQL integration', () => {
  let database: Database;
  let repository: UsageRepository;
  const model = `integration-${randomUUID()}`;
  const ids: string[] = [];
  const filter: AnalyticsFilter = { start: new Date('2026-01-01Z'), end: new Date('2026-01-04Z'), model, bucket: 'day', limit: 50, offset: 0 };
  const event = (overrides: Partial<UsageEvent> = {}): UsageEvent => {
    const requestId = randomUUID(); ids.push(requestId);
    return { requestId, timestamp: new Date('2026-01-02T12:00:00Z'), model, durationMs: 100, promptTokens: 10, completionTokens: 5, totalTokens: 15, statusCode: 200, outcome: 'success', errorCategory: null, ...overrides };
  };
  beforeAll(async () => {
    database = createDatabase({ DATABASE_URL: url, DB_POOL_MAX: 3, DB_TIMEOUT_MS: 1500 })!;
    await runMigrations(database);
    await runMigrations(database);
    repository = new UsageRepository(database);
  });
  afterAll(async () => {
    if (database) {
      if (ids.length) await database.pool.query('DELETE FROM ai_requests WHERE request_id = ANY($1::uuid[])', [ids]);
      await database.close();
    }
  });
  it('applies migrations repeatedly and persists only metadata through the background service', async () => {
    const telemetry = new TelemetryService(repository, 100);
    telemetry.record(event());
    telemetry.record(event({ timestamp: new Date('2026-01-03T12:00:00Z'), durationMs: 300, promptTokens: null, completionTokens: null, totalTokens: null, outcome: 'failure', statusCode: 502, errorCategory: 'upstream_error' }));
    await telemetry.close();
    expect(telemetry.stats().written).toBe(2);
    const summary: any = await repository.aggregate('summary', filter);
    expect(summary).toMatchObject({ totalRequests: 2, successfulRequests: 1, failedRequests: 1, totalTokens: 15, requestsWithTotalTokens: 1, averageLatencyMs: 200 });
    const columns = await database.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_requests' AND table_schema = 'public'");
    expect(columns.rows.map(row => row.column_name).sort()).toEqual(['completion_tokens','duration_ms','error_category','model','outcome','prompt_tokens','request_id','status_code','timestamp','total_tokens']);
  });
  it('filters dates, outcomes and models, paginates UTC buckets and rejects SQL injection', async () => {
    const first: any = await repository.aggregate('usage', { ...filter, limit: 1 });
    const second: any = await repository.aggregate('usage', { ...filter, limit: 1, offset: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.items[0].timestamp).toBe('2026-01-02T00:00:00.000Z');
    expect(second.hasMore).toBe(false);
    expect(second.items[0].failedRequests).toBe(1);
    expect(await repository.aggregate('summary', { ...filter, outcome: 'failure' })).toMatchObject({ totalRequests: 1, totalTokens: null });
    expect(await repository.aggregate('summary', { ...filter, end: new Date('2026-01-03Z') })).toMatchObject({ totalRequests: 1 });
    expect(await repository.aggregate('summary', { ...filter, model: "' OR 1=1 --" })).toMatchObject({ totalRequests: 0, totalTokens: null, averageLatencyMs: null });
    expect(await repository.aggregate('models', filter)).toMatchObject({ items: [{ model, totalRequests: 2 }] });
    expect(await repository.aggregate('errors', filter)).toMatchObject({ items: [{ category: 'upstream_error', totalRequests: 1 }] });
  });
  it('is idempotent and supports concurrent writes', async () => {
    const rows = Array.from({ length: 12 }, () => event({ model: `${model}-concurrent` }));
    await Promise.all(rows.flatMap(row => [repository.insert(row), repository.insert(row)]));
    expect(await repository.aggregate('summary', { ...filter, model: `${model}-concurrent` })).toMatchObject({ totalRequests: 12, totalTokens: 180 });
  });
  it('enforces database constraints and query timeouts then recovers', async () => {
    await expect(repository.insert(event({ totalTokens: -1 }))).rejects.toThrow();
    await expect(database.pool.query('SELECT pg_sleep(4)')).rejects.toThrow();
    expect((await database.pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });
  it('deletes expired rows in bounded batches and preserves the cutoff', async () => {
    const old = event({ timestamp: new Date('1900-01-01Z') });
    const retained = event({ timestamp: new Date('1900-01-02Z') });
    await repository.insert(old); await repository.insert(retained);
    const count = await repository.deleteExpired(new Date('1900-01-02Z'));
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(1000);
    const result = await database.pool.query('SELECT request_id FROM ai_requests WHERE request_id = ANY($1::uuid[])', [[old.requestId, retained.requestId]]);
    expect(result.rows).toEqual([{ request_id: retained.requestId }]);
  });
});

it('bounds connection failure and closes a failed pool', async () => {
  const database = createDatabase({ DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid', DB_POOL_MAX: 1, DB_TIMEOUT_MS: 100 })!;
  const started = Date.now();
  await expect(database.pool.query('SELECT 1')).rejects.toThrow();
  await database.close();
  expect(Date.now() - started).toBeLessThan(2000);
});
