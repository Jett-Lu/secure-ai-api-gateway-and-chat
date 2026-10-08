import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AppConfig } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const createDatabase = (config: Pick<AppConfig, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_TIMEOUT_MS'>) => {
  if (!config.DATABASE_URL) return null;
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    statement_timeout: config.DB_TIMEOUT_MS,
    query_timeout: config.DB_TIMEOUT_MS + 500,
    idle_in_transaction_session_timeout: config.DB_TIMEOUT_MS,
    application_name: 'secure-ai-gateway',
    allowExitOnIdle: true
  });
  pool.on('error', () => logger.warn('database_connection_error'));
  return { pool, db: drizzle(pool), close: () => pool.end() };
};
export type Database = NonNullable<ReturnType<typeof createDatabase>>;
