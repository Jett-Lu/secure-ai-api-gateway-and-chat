export interface UsageMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  requestsWithTotalTokens: number;
  averageLatencyMs: number | null;
}
export interface UsageBucket extends UsageMetrics { timestamp: string }
export interface ModelUsage extends UsageMetrics { model: string }
export interface ErrorUsage extends UsageMetrics { category: string }
export interface Page<T> { items: T[]; limit: number; offset: number; hasMore: boolean }
export interface AnalyticsResponse<T> {
  data: T;
  range: { start: string; end: string };
  telemetry: { enabled: boolean; pending: number; written: number; failed: number; dropped: number };
}
