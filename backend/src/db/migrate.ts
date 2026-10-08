import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

export const runMigrations = async (database: Database): Promise<void> => {
  const client = await database.pool.connect();
  let locked = false;
  let failed = false;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(72819412) AS locked');
    locked = result.rows[0].locked;
    if (!locked) throw new Error('Another migration is running');
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../../src/db/migrations', import.meta.url)) });
  } catch (error) { failed = true; throw error; }
  finally {
    if (locked && !failed) await client.query('SELECT pg_advisory_unlock(72819412)').catch(() => { failed = true; });
    client.release(failed);
  }
};
