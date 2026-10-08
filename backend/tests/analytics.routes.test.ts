import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { envSchema } from '../src/config/env.js';
import { createAnalyticsRouter } from '../src/routes/analytics.js';
import { AnalyticsService } from '../src/services/analytics.js';
import { TelemetryService } from '../src/services/telemetry.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestContextMiddleware } from '../src/middleware/requestContext.js';
import { createAnalyticsAuth } from '../src/middleware/analyticsAuth.js';

const origin = 'http://localhost:5173';
const secret = 'test-only-administrator-secret-123456789';
const config = envSchema.parse({ NODE_ENV: 'test', FRONTEND_ORIGIN: origin, UPSTREAM_API_URL: 'https://example.com', UPSTREAM_MODEL: 'test', ANALYTICS_LOCAL_ENABLED: 'true', ANALYTICS_LOCAL_SECRET: secret });
const makeApp = (overrides = {}, repository: any = null) => {
  const app = express();
  app.use(requestContextMiddleware, express.json());
  app.use('/api/analytics', createAnalyticsRouter({ ...config, ...overrides }, new AnalyticsService(repository, new TelemetryService(null, 2))));
  app.use(errorHandler);
  return app;
};
const signIn = async (app: ReturnType<typeof makeApp>) => {
  const res = await request(app).post('/api/analytics/session').set('Origin', origin).send({ secret });
  expect(res.status).toBe(200);
  expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(res.headers['set-cookie'][0]).toContain('SameSite=Strict');
  return res.headers['set-cookie'][0].split(';')[0];
};
afterEach(() => vi.useRealTimers());

describe('local analytics authorization', () => {
  it('denies unauthenticated requests before database access', async () => {
    expect((await request(makeApp()).get('/api/analytics/summary').set('Origin', origin)).status).toBe(401);
  });
  it.each([{ ANALYTICS_LOCAL_ENABLED: false }, { NODE_ENV: 'production' }, { TRUST_PROXY: true }])('fails closed for %j', async overrides => {
    expect((await request(makeApp(overrides)).post('/api/analytics/session').set('Origin', origin).send({ secret })).status).toBe(403);
  });
  it.each([['Origin', 'http://evil.example'], ['Host', 'evil.example'], ['X-Forwarded-For', '127.0.0.1'], ['Forwarded', 'for=127.0.0.1']])('rejects %s bypass', async (key, value) => {
    expect((await request(makeApp()).post('/api/analytics/session').set('Origin', origin).set(key, value).send({ secret })).status).toBe(403);
  });
  it('rejects direct remote peers independent of forwarded identity', () => {
    let status = 0;
    createAnalyticsAuth(config).localOnly({ socket: { remoteAddress: '192.0.2.1' }, headers: { host: 'localhost', origin } } as any,
      { setHeader() {}, status(value: number) { status = value; return this; }, json() {} } as any, () => { throw new Error('bypass'); });
    expect(status).toBe(403);
  });
  it('does not accept provider keys or wrong secrets', async () => {
    expect((await request(makeApp()).post('/api/analytics/session').set('Origin', origin).send({ secret: 'sk_provider_key' })).status).toBe(401);
  });
  it('reports unavailable storage only after authentication and invalidates logout', async () => {
    const app = makeApp();
    const cookie = await signIn(app);
    const res = await request(app).get('/api/analytics/summary').set('Origin', origin).set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(res.headers['cache-control']).toBe('no-store');
    await request(app).post('/api/analytics/logout').set('Origin', origin).set('Cookie', cookie);
    expect((await request(app).get('/api/analytics/summary').set('Origin', origin).set('Cookie', cookie)).status).toBe(401);
  });
  it('expires sessions after fifteen minutes', async () => {
    const app = makeApp();
    const cookie = await signIn(app);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 900001);
    expect((await request(app).get('/api/analytics/summary').set('Origin', origin).set('Cookie', cookie)).status).toBe(401);
  });
  it.each(['start=bad', 'start=2026-01-01T00:00:00Z&end=2026-10-01T00:00:00Z', 'limit=1000', 'offset=-1', 'bucket=minute', 'model=a&model=b', 'unknown=secret', 'start=2026-01-02T00:00:00Z&end=2026-01-01T00:00:00Z'])('validates %s', async query => {
    const app = makeApp();
    const cookie = await signIn(app);
    const res = await request(app).get(`/api/analytics/usage?${query}`).set('Origin', origin).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
  it('sanitizes database exceptions', async () => {
    const app = makeApp({}, { aggregate: async () => { throw new Error('postgres://user:password@private-db SQL'); } });
    const cookie = await signIn(app);
    const res = await request(app).get('/api/analytics/models').set('Origin', origin).set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
