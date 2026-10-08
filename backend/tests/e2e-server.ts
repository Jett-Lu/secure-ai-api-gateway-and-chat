import { createServer } from 'node:http';
import { once } from 'node:events';

// Deterministic provider double; gateway, sessions and PostgreSQL remain real.
if (!process.env.TEST_DATABASE_URL) throw new Error('A disposable TEST_DATABASE_URL is required');
const upstream = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Verified upstream reply' } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }));
  });
});
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
const address = upstream.address();
if (!address || typeof address === 'string') throw new Error('Upstream failed to listen');
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '4100', FRONTEND_ORIGIN: 'http://localhost:5173', TRUST_PROXY: 'false',
  UPSTREAM_API_URL: `http://127.0.0.1:${address.port}`, UPSTREAM_MODEL: 'e2e-test-model', RATE_LIMIT_MAX: '200',
  DATABASE_URL: process.env.TEST_DATABASE_URL, ANALYTICS_LOCAL_ENABLED: 'true',
  ANALYTICS_LOCAL_SECRET: 'e2e-only-admin-secret-never-use-outside-tests'
});
const { createDatabase } = await import('../src/db/client.js');
const { getConfig } = await import('../src/config/env.js');
const { runMigrations } = await import('../src/db/migrate.js');
const database = createDatabase(getConfig())!;
await runMigrations(database);
await database.close();
await import('../src/server.js');
process.on('SIGTERM', () => upstream.close());
process.on('SIGINT', () => upstream.close());
