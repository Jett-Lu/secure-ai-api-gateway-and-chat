import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnalyticsError, analyticsRequest } from '../services/analytics';
import type { AnalyticsResponse, ErrorUsage, ModelUsage, Page, UsageBucket, UsageMetrics } from '../types/analytics';

const format = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const date = (value: Date) => value.toISOString().slice(0, 10);
const Metric = ({ label, value }: { label: string; value: number | null }) => <article className="info-card"><h3>{label}</h3><p>{format(value)}</p></article>;

interface DashboardData {
  summary: AnalyticsResponse<UsageMetrics>;
  usage: AnalyticsResponse<Page<UsageBucket>>;
  models: AnalyticsResponse<Page<ModelUsage>>;
  errors: AnalyticsResponse<Page<ErrorUsage>>;
}

export function AnalyticsDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [start, setStart] = useState(() => date(new Date(Date.now() - 6 * 86400000)));
  const [end, setEnd] = useState(() => date(new Date()));
  const [model, setModel] = useState('');
  const [offset, setOffset] = useState(0);
  const secretInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const begin = () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setData(null);
    return controller;
  };
  const fail = (reason: unknown, controller: AbortController) => {
    if (controller.signal.aborted) return;
    if (reason instanceof AnalyticsError && [401, 403].includes(reason.status)) setAuthenticated(false);
    setError(reason instanceof AnalyticsError ? reason.message : 'Unable to reach analytics. Please retry.');
  };
  const load = async (nextOffset = 0) => {
    const controller = begin();
    try {
      const until = new Date(`${end}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + 1);
      const query = new URLSearchParams({ start: `${start}T00:00:00Z`, end: until.toISOString(), limit: '100', model });
      if (!model) query.delete('model');
      const [summary, usage, models, errors] = await Promise.all([
        analyticsRequest<AnalyticsResponse<UsageMetrics>>(`summary?${query}`, controller.signal),
        analyticsRequest<AnalyticsResponse<Page<UsageBucket>>>(`usage?${query}`, controller.signal),
        analyticsRequest<AnalyticsResponse<Page<ModelUsage>>>(`models?${query}&offset=${nextOffset}`, controller.signal),
        analyticsRequest<AnalyticsResponse<Page<ErrorUsage>>>(`errors?${query}`, controller.signal)
      ]);
      if (!controller.signal.aborted) { setData({ summary, usage, models, errors }); setAuthenticated(true); setOffset(nextOffset); }
    } catch (reason) { fail(reason, controller); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const login = async (event: FormEvent) => {
    event.preventDefault();
    const secret = secretInput.current?.value ?? '';
    if (secretInput.current) secretInput.current.value = '';
    const controller = begin();
    try {
      await analyticsRequest('session', controller.signal, { secret });
      if (!controller.signal.aborted) { setAuthenticated(true); await load(); }
    } catch (reason) { fail(reason, controller); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const logout = async () => {
    const controller = begin();
    try { await analyticsRequest('logout', controller.signal, {}); setAuthenticated(false); }
    catch (reason) { fail(reason, controller); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <section className="surface-card analytics-panel" aria-label="Usage analytics">
    <h2>Usage analytics</h2>
    <p className="subtle-text">Local administrators only. Operational metadata across this gateway; conversation content is never recorded.</p>
    {!authenticated ? <form onSubmit={login} className="analytics-filters">
      <label>Administrator secret<input ref={secretInput} type="password" autoComplete="off" maxLength={256} required className="text-input" /></label>
      <button className="button" disabled={busy}>Sign in</button>
      <button className="button" type="button" disabled={busy} onClick={() => void load()}>Use existing session</button>
    </form> : <>
      <form className="analytics-filters" onSubmit={event => { event.preventDefault(); void load(); }}>
        <label>From (UTC)<input className="text-input" type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
        <label>Through (UTC)<input className="text-input" type="date" required value={end} onChange={event => setEnd(event.target.value)} /></label>
        <label>Model<input className="text-input" value={model} maxLength={128} placeholder="All models" onChange={event => setModel(event.target.value)} /></label>
        <button className="button" disabled={busy}>Refresh</button>
        <button className="button" type="button" disabled={busy} onClick={() => void logout()}>Sign out</button>
      </form>
    </>}
    {busy ? <p role="status">Loading analytics…</p> : null}
    {error ? <p className="app-error" role="alert">{error}</p> : null}
    {data ? <>
      {data.summary.data.totalRequests === 0 ? <p>No usage recorded for this period.</p> : <>
        <div className="info-grid analytics-metrics">
          <Metric label="Total requests" value={data.summary.data.totalRequests} />
          <Metric label="Successful" value={data.summary.data.successfulRequests} />
          <Metric label="Failed" value={data.summary.data.failedRequests} />
          <Metric label="Reported total tokens" value={data.summary.data.totalTokens} />
          <Metric label="Average latency (ms)" value={data.summary.data.averageLatencyMs} />
          <Metric label="Requests with total tokens" value={data.summary.data.requestsWithTotalTokens} />
        </div>
        <p className="subtle-text">Token sums include reported metrics only. Unknown usage is not counted as zero.</p>
        <h3>Daily requests (UTC)</h3>
        <div className="analytics-trends">
          {data.usage.data.items.map(item => <div className="analytics-trend" key={item.timestamp}>
            <span>{item.timestamp.slice(0, 10)}</span>
            <meter min={0} max={Math.max(1, ...data.usage.data.items.map(bucket => bucket.totalRequests))} value={item.totalRequests} aria-label={`Requests on ${item.timestamp.slice(0, 10)}`} />
            <span>{format(item.totalRequests)} ({format(item.failedRequests)} failed)</span>
          </div>)}
        </div>
        <h3>Per-model usage</h3>
        <div className="analytics-table"><table><thead><tr><th>Model</th><th>Requests</th><th>Failed</th><th>Reported tokens</th><th>Avg. ms</th></tr></thead>
          <tbody>{data.models.data.items.map(item => <tr key={item.model}><td>{item.model}</td><td>{format(item.totalRequests)}</td><td>{format(item.failedRequests)}</td><td>{format(item.totalTokens)}</td><td>{format(item.averageLatencyMs)}</td></tr>)}</tbody>
        </table></div>
        <div className="action-group">
          <button className="button" disabled={busy || offset === 0} onClick={() => void load(Math.max(0, offset - 100))}>Previous models</button>
          <button className="button" disabled={busy || !data.models.data.hasMore} onClick={() => void load(offset + 100)}>Next models</button>
        </div>
        <h3>Error categories</h3>
        {data.errors.data.items.length ? <ul>{data.errors.data.items.map(item => <li key={item.category}>{item.category}: {format(item.totalRequests)}</li>)}</ul> : <p>No errors recorded.</p>}
      </>}
      <p className="subtle-text">This process: {data.summary.telemetry.pending} pending writes, {data.summary.telemetry.failed} failed writes, {data.summary.telemetry.dropped} dropped events. Best-effort telemetry may be incomplete.</p>
    </> : null}
  </section>;
}
