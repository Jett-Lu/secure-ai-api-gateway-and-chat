# Secure AI API Gateway & Chat System

A security-focused full-stack AI chat application that validates client requests and forwards them through a Node.js/Express backend to a configured upstream model API. Users provide their API keys at runtime; the application is designed to handle these credentials in memory without persisting them. The current implementation uses an OpenAI-style upstream API and does not yet implement multi-provider routing.

## Why this project exists
Most chatbot demos optimize convenience over safety. This project takes the opposite approach:
- strict backend orchestration,
- default-deny validation,
- sanitized operational logging,
- production-minded security controls.

## Architecture (short)
### Frontend (`frontend/`)
- React + TypeScript + Vite.
- Clean chat interface with API key panel, transcript, composer, loading state, clear conversation, and clear key controls.
- API key is kept in React memory only (no localStorage/sessionStorage/cookies).
- Frontend only talks to backend (`/api/*`).

### Backend (`backend/`)
- Node.js + Express + TypeScript.
- Middleware-first pipeline for: request IDs, security headers, strict CORS, timeouts, JSON body limits, rate limiting, request logging, and centralized error handling.
- Zod validation for chat payloads.
- Dedicated upstream service layer for model calls with timeout and sanitized failures.

### Data flow
1. User enters API key and prompt in frontend.
2. Frontend posts `{ apiKey, messages }` to `POST /api/chat`.
3. Backend validates payload, applies limits/middleware, and forwards to upstream provider.
4. Backend returns structured JSON response to frontend.

## Threat model (short)
### 1) Secret persistence risk
**Threat:** API keys end up in storage (browser/server).  
**Mitigation:** key only in process memory (React state + per-request backend memory).

### 2) Secret leakage risk
**Threat:** keys leak via logs/errors.  
**Mitigation:** structured logger with redaction, no raw auth headers, sanitized error responses.

### 3) Abuse/flooding risk
**Threat:** spam requests degrade service.  
**Mitigation:** rate limiting, payload limits, prompt/message/turn limits, request and upstream timeouts.

### 4) Malformed input risk
**Threat:** malformed payloads bypass logic.  
**Mitigation:** strict Zod schema with fail-closed behavior and explicit shape checks.

### 5) Insecure deployment risk
**Threat:** permissive production config.  
**Mitigation:** startup validation with production hard-fails for insecure settings.

## Security controls implemented
- `helmet` security headers.
- `x-powered-by` disabled.
- CORS allowlist using `FRONTEND_ORIGIN` (no wildcard behavior in production).
- Request body size limit (`REQUEST_BODY_LIMIT`).
- Request timeout (`REQUEST_TIMEOUT_MS`) + upstream timeout (`UPSTREAM_TIMEOUT_MS`).
- IP-based rate limiting (`RATE_LIMIT_*`).
- Strict payload validation (messages, turns, prompt length, API key shape).
- Centralized sanitized error handling.
- Structured logging with secret redaction and masked IPs.
- `.env` excluded from git and `.env.example` provided.

## Validation and limit rules
- API key: trimmed, 12–256 chars, regex `^[A-Za-z0-9._\-]+$`.
- `messages`: min 1, max `MAX_MESSAGES` (default 40).
- Message roles: `system | user | assistant`.
- Message content: trimmed, non-empty, max `MAX_MESSAGE_CHARS` (default 4000).
- At least one user message.
- Last message must be from `user`.
- Max user turns: `MAX_TURNS` (default 20).
- Latest prompt max chars: `MAX_PROMPT_CHARS` (default 2000).

## Project structure
```text
/
  backend/
    src/
      config/
      middleware/
      routes/
      services/
      types/
      utils/
      validation/
      app.ts
      server.ts
  frontend/
    src/
      components/
      hooks/
      services/
      state/
      types/
      App.tsx
      main.tsx
  .env.example
  .gitignore
  README.md
```

## Quick start (local)
### Prerequisites
- Node.js 20+
- npm 10+

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
```bash
cp .env.example .env
```

### 3) Run backend (terminal A)
```bash
npm run dev:backend
```

### 4) Run frontend (terminal B)
```bash
npm run dev:frontend
```

Default URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Environment variables
See `.env.example` for full values.

Key variables:
- `NODE_ENV`, `PORT`, `TRUST_PROXY`
- `FRONTEND_ORIGIN`
- `REQUEST_TIMEOUT_MS`, `UPSTREAM_TIMEOUT_MS`
- `REQUEST_BODY_LIMIT`
- `MAX_PROMPT_CHARS`, `MAX_MESSAGE_CHARS`, `MAX_TURNS`, `MAX_MESSAGES`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- `UPSTREAM_API_URL`, `UPSTREAM_MODEL`

## Known limitations
- Rate limiter is in-memory per process (not distributed).
- Upstream response schema is currently OpenAI-style.
- No streaming responses yet.

## Suggested next improvements
- Redis-backed distributed rate limiting.
- Provider adapter layer for multiple vendor formats.
- Streaming responses + cancellation support.
- Integration tests for route/middleware behavior.
