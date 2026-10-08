export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface UsageEvent extends TokenUsage {
  requestId: string;
  timestamp: Date;
  model: string;
  durationMs: number;
  statusCode: number;
  outcome: 'success' | 'failure';
  errorCategory: string | null;
}

export interface AnalyticsFilter {
  start: Date;
  end: Date;
  model?: string;
  outcome?: 'success' | 'failure';
  bucket: 'day' | 'hour';
  limit: number;
  offset: number;
}
export type AnalyticsKind = 'summary' | 'usage' | 'models' | 'errors';
export interface UsageWriter { insert(event: UsageEvent): Promise<void> }
