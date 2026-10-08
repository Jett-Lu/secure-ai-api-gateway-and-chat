# PostgreSQL usage analytics implementation

The supplied engineering brief authorizes the complete implementation. Work is on
`codex/postgres-usage-analytics`, preserving the existing chat contract and UI.

## Design

Use Drizzle with node-postgres pooling, versioned SQL migrations, and a metadata-only
`ai_requests` table. Repositories own parameterized queries; a bounded telemetry
service owns asynchronous writes and retention; HTTP middleware observes final
chat outcomes exactly once. Missing token counters remain null. Analytics are
global operational aggregates, never user billing records.

Analytics are disabled by default and unavailable in production. Explicit local
development access requires a separately configured admin secret, a direct loopback
connection, an allowlisted local Host and Origin, and a short-lived HttpOnly session.
No provider credential is used for administration. The frontend keeps chat mounted
and adds a collapsible analytics panel with authentication and all data states.

## Execution checklist

- [x] Database schema, migration runner, pool limits, environment loading, Compose.
- [x] Usage normalization, bounded writer, HTTP lifecycle integration, retention.
- [x] Local admin sessions, validated analytics APIs, repository aggregation.
- [x] Typed dashboard with summary, trends, models, errors, and pagination.
- [x] Unit, HTTP, real PostgreSQL integration, frontend regression tests.
- [x] Complete builds, dependency audit, security review, documentation and handoff.

## Verification focus

Unknown usage must not become zero; malformed metrics must not break a valid reply.
Timeouts/disconnects must produce one outcome; queued writes must not retain secrets.
Analytics must reject unauthenticated, remote, proxy-forwarded, and production access.
Database outages must remain bounded and preserve chat. Migrations must be repeatable
and transactional. Retention must affect only expired telemetry, in bounded batches.

## Baseline

All 10 existing tests pass with `npm test` (Windows sandbox blocks esbuild path
resolution; the authorized unsandboxed run works). Initial install reports 17
dependency vulnerabilities; audit and remediation are part of final verification.
Docker, psql, and gh are not on PATH; real database and PR capability will be checked.

## Results and decisions

Used a disposable native PostgreSQL 17.10 binary under ignored `.test-tools` because
Docker is not installed. Real migrations and integration tests executed successfully.
Browser plugin was unavailable; Playwright Chromium exercised desktop and mobile,
including real backend sessions and PostgreSQL with a deterministic provider double.
Independent review identified a worker handoff race; a failing regression established
the failure, then the worker restart/close logic fixed it. Screenshot inspection exposed
a PostgreSQL timezone serialization bug, likewise reproduced and fixed with a database
test. Existing chat unknown-field stripping was tightened to rejection per the brief.
Dependency updates and targeted overrides eliminate the reported audit vulnerabilities.
Final evidence and deployment boundaries are recorded in `docs/engineering-audit.md`.
