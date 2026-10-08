import { sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, varchar, integer, index, check } from 'drizzle-orm/pg-core';

export const aiRequests = pgTable('ai_requests', {
  requestId: uuid('request_id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  model: varchar('model', { length: 128 }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  outcome: varchar('outcome', { length: 7 }).notNull(),
  statusCode: integer('status_code').notNull(),
  errorCategory: varchar('error_category', { length: 32 })
}, table => [
  index('ai_requests_timestamp_idx').on(table.timestamp),
  index('ai_requests_model_timestamp_idx').on(table.model, table.timestamp),
  check('valid_duration', sql`${table.durationMs} >= 0`),
  check('valid_tokens', sql`(${table.promptTokens} IS NULL OR ${table.promptTokens} >= 0) AND (${table.completionTokens} IS NULL OR ${table.completionTokens} >= 0) AND (${table.totalTokens} IS NULL OR ${table.totalTokens} >= 0)`),
  check('valid_outcome', sql`${table.outcome} IN ('success', 'failure')`),
  check('valid_status', sql`${table.statusCode} BETWEEN 100 AND 599`),
  check('valid_error', sql`${table.errorCategory} IS NULL OR ${table.errorCategory} IN ('validation_error', 'rate_limit_error', 'timeout_error', 'upstream_error', 'internal_error', 'client_cancelled')`)
]);
