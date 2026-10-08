import './config/loadEnv.js';
import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { logger } from './utils/logger.js';
import { createDatabase } from './db/client.js';
import { UsageRepository } from './repositories/usageRepository.js';
import { TelemetryService } from './services/telemetry.js';
import { startRetention } from './services/retention.js';

const config = getConfig();

const database = createDatabase(config);
const repository = database ? new UsageRepository(database) : null;
const telemetry = new TelemetryService(repository, config.TELEMETRY_QUEUE_SIZE);
const stopRetention = startRetention(repository, config.TELEMETRY_RETENTION_DAYS);
const app = createApp({ repository, telemetry });
const server = app.listen(config.PORT, config.ANALYTICS_LOCAL_ENABLED ? '127.0.0.1' : '0.0.0.0', () => {
  logger.info('server_started', {
    port: config.PORT,
    nodeEnv: config.NODE_ENV
  });
});

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => { logger.warn('shutdown_deadline_reached'); process.exit(1); }, 15000);
  deadline.unref();
  server.close(async () => {
    try { await stopRetention(); await telemetry.close(); await database?.close(); }
    catch { logger.warn('shutdown_cleanup_failed'); process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
