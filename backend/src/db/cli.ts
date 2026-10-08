import '../config/loadEnv.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { getConfig } from '../config/env.js';
import { UsageRepository } from '../repositories/usageRepository.js';

const config = getConfig();
const database = createDatabase(config);
if (!database) { console.error('DATABASE_URL is required.'); process.exitCode = 1; }
else {
  try {
    if (process.argv[2] === 'prune') {
      const deleted = await new UsageRepository(database).deleteExpired(new Date(Date.now() - config.TELEMETRY_RETENTION_DAYS * 86400000));
      console.log(`Deleted ${deleted} expired metadata rows (maximum 1000 per run).`);
    } else { await runMigrations(database); console.log('Migrations complete.'); }
  } catch { console.error('Database operation failed. Check database connectivity, permissions, and migration state.'); process.exitCode = 1; }
  finally { await database.close(); }
}
