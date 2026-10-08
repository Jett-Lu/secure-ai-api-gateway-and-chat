const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class AnalyticsError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'Sign in to local analytics.' : status === 403 ? 'Analytics is disabled or restricted to authorized local development.' :
      status === 503 ? 'The usage database is unavailable. You can continue chatting.' : status === 400 ? 'Check your filters. The date range must be between 1 and 90 days.' : 'Unable to load analytics. Please retry.');
  }
}

export const analyticsRequest = async <T>(path: string, signal: AbortSignal, body?: object): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)])
  });
  if (!response.ok) throw new AnalyticsError(response.status);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
};
