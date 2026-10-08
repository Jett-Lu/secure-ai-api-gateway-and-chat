import type { UsageRepository } from '../repositories/usageRepository.js';
import { logger } from '../utils/logger.js';

export const startRetention = (repository: UsageRepository | null, days: number) => {
  let pending: Promise<unknown> | null = null;
  const run = () => {
    if (!repository || pending) return;
    pending = repository.deleteExpired(new Date(Date.now() - days * 86400000))
      .catch(() => logger.warn('telemetry_retention_failed'))
      .finally(() => { pending = null; });
  };
  run();
  const timer = setInterval(run, 60000);
  timer.unref();
  return async () => { clearInterval(timer); await pending; };
};
