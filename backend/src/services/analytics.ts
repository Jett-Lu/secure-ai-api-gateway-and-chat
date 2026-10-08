import type { UsageRepository } from '../repositories/usageRepository.js';
import type { AnalyticsFilter, AnalyticsKind } from '../types/analytics.js';
import { AppError } from '../types/errors.js';
import type { TelemetryService } from './telemetry.js';

export class AnalyticsService {
  constructor(private repository: Pick<UsageRepository, 'aggregate'> | null, private telemetry: TelemetryService) {}
  async query(kind: AnalyticsKind, filter: AnalyticsFilter) {
    try {
      if (!this.repository) throw new Error('disabled');
      const data = await this.repository.aggregate(kind, filter);
      return { data, range: { start: filter.start.toISOString(), end: filter.end.toISOString() }, telemetry: this.telemetry.stats() };
    } catch {
      throw new AppError('Usage database is unavailable. Chat remains available.', 503, 'database_unavailable');
    }
  }
}
