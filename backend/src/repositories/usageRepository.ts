import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { aiRequests } from '../db/schema.js';
import type { AnalyticsFilter, AnalyticsKind, UsageEvent, UsageWriter } from '../types/analytics.js';

const metrics = sql`count(*)::float8 AS "totalRequests",
  count(*) FILTER (WHERE outcome = 'success')::float8 AS "successfulRequests",
  count(*) FILTER (WHERE outcome = 'failure')::float8 AS "failedRequests",
  sum(prompt_tokens)::float8 AS "promptTokens",
  sum(completion_tokens)::float8 AS "completionTokens",
  sum(total_tokens)::float8 AS "totalTokens",
  count(total_tokens)::float8 AS "requestsWithTotalTokens",
  avg(duration_ms)::float8 AS "averageLatencyMs"`;

export class UsageRepository implements UsageWriter {
  constructor(private database: Database) {}

  async insert(event: UsageEvent): Promise<void> {
    await this.database.db.insert(aiRequests).values({
      requestId: event.requestId, timestamp: event.timestamp, model: event.model,
      durationMs: event.durationMs, statusCode: event.statusCode, outcome: event.outcome,
      errorCategory: event.errorCategory, promptTokens: event.promptTokens,
      completionTokens: event.completionTokens, totalTokens: event.totalTokens
    }).onConflictDoNothing({ target: aiRequests.requestId });
  }

  async aggregate(kind: AnalyticsKind, filter: AnalyticsFilter): Promise<unknown> {
    const where = and(gte(aiRequests.timestamp, filter.start), lt(aiRequests.timestamp, filter.end),
      filter.model === undefined ? undefined : eq(aiRequests.model, filter.model),
      filter.outcome === undefined ? undefined : eq(aiRequests.outcome, filter.outcome));
    if (kind === 'summary') {
      const result = await this.database.db.execute(sql`SELECT ${metrics} FROM ${aiRequests} WHERE ${where}`);
      return result.rows[0];
    }
    // Only fixed SQL fragments are selected; all user values are bound parameters.
    const group = kind === 'models' ? sql`model` : kind === 'errors' ? sql`error_category` :
      filter.bucket === 'hour' ? sql`date_trunc('hour', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'` :
      sql`date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    const alias = kind === 'models' ? sql`"model"` : kind === 'errors' ? sql`"category"` : sql`"timestamp"`;
    const errorFilter = kind === 'errors' ? sql`AND outcome = 'failure'` : sql``;
    const result = await this.database.db.execute(sql`SELECT ${group} AS ${alias}, ${metrics}
      FROM ${aiRequests} WHERE ${where} ${errorFilter} GROUP BY ${group}
      ORDER BY ${group} ASC LIMIT ${filter.limit + 1} OFFSET ${filter.offset}`);
    const items = result.rows.slice(0, filter.limit).map(row => kind === 'usage'
      ? { ...row, timestamp: new Date(String(row.timestamp)).toISOString() } : row);
    return { items, limit: filter.limit, offset: filter.offset, hasMore: result.rows.length > filter.limit };
  }

  async deleteExpired(cutoff: Date): Promise<number> {
    const result = await this.database.db.execute(sql`DELETE FROM ${aiRequests} WHERE request_id IN
      (SELECT request_id FROM ${aiRequests} WHERE timestamp < ${cutoff} ORDER BY timestamp LIMIT 1000)
      RETURNING request_id`);
    return result.rows.length;
  }
}
