# Engineering audit — 2026-10-08

## Delivered

PostgreSQL/Drizzle persistence, transactional versioned migrations, bounded pool
and query timeouts, metadata-only asynchronous telemetry, configurable retention,
four protected aggregate APIs, and a typed React dashboard alongside the existing
chat. The schema and operational procedures are documented in the root README.

Work branch: `codex/postgres-usage-analytics`, based on `79bb66d`.

## Verification actually executed

Environment: Windows, Node 24.21.0, npm 11.19.0, native PostgreSQL 17.10 on
127.0.0.1:55432. PostgreSQL was installed only into the ignored `.test-tools`
directory for verification because Docker/psql were not installed on PATH.
The tests used a disposable cluster, never a hosted or user database.

| Exact command | Result |
| --- | --- |
| `npm ci` (baseline) | Dependencies installed; original audit findings identified |
| `npm test` (baseline) | 10 original tests passed |
| `$env:TEST_DATABASE_URL='postgresql://gateway_test@127.0.0.1:55432/postgres'; npm test` | 47 tests passed, zero skipped; includes 5 real PostgreSQL cases and connection-failure test |
| `npm run build` | Backend TypeScript and frontend TypeScript/Vite production builds passed |
| `npm run db:generate --workspace backend` | Schema and checked-in migration agree; no additional changes generated |
| `npm run db:migrate --workspace backend` | Successful against real PostgreSQL; repeated execution successful |
| `node backend/dist/db/cli.js` | Compiled migration entrypoint successful |
| `npm run db:prune --workspace backend` | Successful; 0 expired rows in final fixture (bounded deletion behavior independently tested) |
| `$env:TEST_DATABASE_URL='postgresql://gateway_test@127.0.0.1:55432/postgres'; npm run test --workspace frontend` | 6 browser tests passed: 3 desktop and 3 mobile, including 2 live full-stack tests |
| `npm audit` | 0 vulnerabilities |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | Passed |

Migration/prune CLI verification used these process environment values:

```powershell
$env:NODE_ENV='test'
$env:FRONTEND_ORIGIN='http://localhost:5173'
$env:UPSTREAM_API_URL='https://example.com/chat'
$env:UPSTREAM_MODEL='verification'
$env:DATABASE_URL='postgresql://gateway_test@127.0.0.1:55432/postgres'
```

Windows sandbox restrictions initially prevented esbuild resolving its config.
Authorized execution outside that sandbox succeeded; this was not an application
failure. Browser command output includes only the harness's NO_COLOR/FORCE_COLOR
warning; no frontend runtime exceptions were observed in the tested flows.

## Coverage and security review

- Original health, chat, validation, upstream error, timeout and redaction checks pass.
- Concurrent chat completions produce unique metadata-only events without storing
  provider keys, prompts or replies. Missing/malformed token data stays unknown.
- Rejected requests and upstream failures carry fixed categories. Database write
  failure does not change a successful chat response. Queue capacity and shutdown
  are tested.
- Anonymous, wrong-secret, production, disabled, proxy-enabled, remote-peer,
  hostile-host, hostile-origin and forwarded-header analytics access is denied.
- Session expiry/logout, HttpOnly/SameSite cookie attributes, validation, cache
  policy and sanitized database-unavailable responses are tested.
- Real PostgreSQL tests exercise idempotent migration application, schema columns,
  constraints, query timeout/recovery, persistence, aggregates, date/outcome/model
  filtering, UTC buckets, pagination, injection resistance, concurrent/idempotent
  writes, and retention cutoff preservation.
- Independent review found a worker completion race. The regression first failed
  (one event stranded), then passed after worker handoff/shutdown were corrected.
- Screenshot review found a local-offset serialization bug in UTC bucket labels.
  A real PostgreSQL assertion reproduced it; the API now returns ISO UTC strings.
- Existing Zod schemas stripped unknown chat fields despite strict-validation
  documentation. A regression first failed; both payload/message objects now
  reject unknown fields. Validation responses no longer echo caller-controlled
  issue text. Logs/404s no longer echo arbitrary URL paths.
- Independent final review found no substantive outstanding issues in the changed
  backend/frontend behavior. It did not independently rerun database/browser tests.

Dependency remediation updated the lockfile, upgraded Vitest to a patched version,
and added scoped overrides for `qs` and esbuild used by tsx/Drizzle tooling. Full
tests/builds and migration generation were rerun after those changes.

## Browser QA

Browser plugin was unavailable, so the frontend-testing skill's Playwright fallback
was used. Target URL was `http://localhost:5173`, with a real gateway on 4100 and
PostgreSQL on 55432. Viewports: desktop Chromium 1280×720 and Pixel 7 emulation
393×727. The provider endpoint was a deterministic local HTTP double; analytics
sessions, API reads, queue writes and SQL were real in the live tests.

| Check | Result |
| --- | --- |
| Page identity and meaningful content | Passed |
| Framework overlay/blank-page check | Passed via rendered page and interactions |
| Runtime exceptions | None in tested flows |
| Desktop/mobile layout | Visually inspected; dashboard adapts and no page overflow in UI test |
| Authentication and aggregate display | Passed with real backend cookie and database |
| Date/model filters and pagination controls | Passed |
| Restricted, unavailable, empty states | Passed using controlled API responses |
| Logout clears metrics; old session denied | Passed |
| Existing chat send/clear and provider key clear | Passed |
| Browser storage privacy | No localStorage/sessionStorage entries; admin cookie inaccessible to script |

Screenshots are local review evidence, outside the repository:
`analytics-desktop.png` and `analytics-mobile.png` under this chat's visualization
directory. The final screenshots reflect the UTC fix. Live browser traces are
disabled to avoid storing even fixture credentials in traces.

## Limitations / deployment assessment

Ready for review and a local-development rollout. **Not ready for publicly exposed
production analytics**: the implemented administration mechanism intentionally
rejects production. A production identity/role/session system remains separate work.

Docker Compose execution could not be verified because Docker is unavailable;
equivalent native PostgreSQL migrations and data flows were verified. Real provider
API calls were not made (no user key or billable call); provider behavior is covered
by deterministic doubles. Hosted PostgreSQL TLS, multi-instance deployment,
production load/failover, hard-kill recovery, and browsers other than Chromium were
not verified. No claim of production load certification is made.

Telemetry can be lost during outages, saturation, crashes or the 15-second shutdown
deadline; counters surface failures/drops per process. Retention is age-based,
eventual and bounded per pass, not a hard storage cap. Aggregate requests use
independent snapshots. There is no tenant attribution, streaming, provider routing,
durable queue, or distributed rate limiter. These limitations are also in README.

## Changed files

The complete file manifest follows; generated dependency lock and migration
metadata are included. The previously tracked TypeScript build cache is removed
and ignored because it is regenerated by builds.

```text
.env.example
.gitignore
backend/drizzle.config.ts
backend/package.json
backend/src/app.ts
backend/src/config/env.ts
backend/src/config/loadEnv.ts
backend/src/db/cli.ts
backend/src/db/client.ts
backend/src/db/migrate.ts
backend/src/db/migrations/0000_usage_metadata.sql
backend/src/db/migrations/meta/_journal.json
backend/src/db/migrations/meta/0000_snapshot.json
backend/src/db/schema.ts
backend/src/middleware/analyticsAuth.ts
backend/src/middleware/corsPolicy.ts
backend/src/middleware/errorHandler.ts
backend/src/middleware/requestLogger.ts
backend/src/middleware/telemetry.ts
backend/src/repositories/usageRepository.ts
backend/src/routes/analytics.ts
backend/src/routes/chat.ts
backend/src/server.ts
backend/src/services/analytics.ts
backend/src/services/retention.ts
backend/src/services/telemetry.ts
backend/src/services/upstreamClient.ts
backend/src/services/usage.ts
backend/src/types/analytics.ts
backend/src/types/errors.ts
backend/src/validation/analytics.ts
backend/src/validation/chat.ts
backend/tests/analytics.routes.test.ts
backend/tests/chat.validation.test.ts
backend/tests/database.integration.test.ts
backend/tests/e2e-server.ts
backend/tests/telemetry.routes.test.ts
backend/tests/usage.test.ts
compose.yaml
docs/engineering-audit.md
docs/implementation-plan.md
frontend/index.html
frontend/package.json
frontend/playwright.config.ts
frontend/src/App.tsx
frontend/src/components/AnalyticsDashboard.tsx
frontend/src/services/analytics.ts
frontend/src/styles.css
frontend/src/types/analytics.ts
frontend/tests/dashboard.spec.ts
frontend/tests/live.spec.ts
frontend/tsconfig.tsbuildinfo
package-lock.json
package.json
README.md
```
