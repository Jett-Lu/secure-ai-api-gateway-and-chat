import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/env.js';

const COOKIE = 'gateway_analytics';
const TTL = 15 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest();
const loopback = (value: string | undefined) => value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';

export const createAnalyticsAuth = (config: AppConfig) => {
  const sessions = new Map<string, number>();
  const sessionKey = (req: Request) => {
    const value = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? hash(value).toString('hex') : '';
  };
  const localOnly: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const host = req.headers.host ?? '';
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(host);
    const forwarded = Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'));
    if (!config.ANALYTICS_LOCAL_ENABLED || config.NODE_ENV === 'production' || config.TRUST_PROXY || !config.ANALYTICS_LOCAL_SECRET ||
      !loopback(req.socket.remoteAddress) || !localHost || forwarded || req.headers.origin !== config.FRONTEND_ORIGIN ||
      !['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.FRONTEND_ORIGIN).hostname)) {
      res.status(403).json({ error: { code: 'ANALYTICS_RESTRICTED', message: 'Analytics is restricted to authorized local development.' } });
      return;
    }
    next();
  };
  const requireSession: RequestHandler = (req, res, next) => {
    const key = sessionKey(req);
    if ((sessions.get(key) ?? 0) <= Date.now()) {
      sessions.delete(key);
      res.status(401).json({ error: { code: 'ANALYTICS_UNAUTHORIZED', message: 'Sign in to local analytics.' } });
      return;
    }
    next();
  };
  const login = (secret: string, req: Request, res: Response): void => {
    if (!timingSafeEqual(hash(secret), hash(config.ANALYTICS_LOCAL_SECRET!))) {
      res.status(401).json({ error: { code: 'ANALYTICS_UNAUTHORIZED', message: 'Invalid administrator secret.' } });
      return;
    }
    sessions.delete(sessionKey(req));
    for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value!);
    const session = randomBytes(32).toString('hex');
    sessions.set(hash(session).toString('hex'), Date.now() + TTL);
    res.cookie(COOKIE, session, { httpOnly: true, sameSite: 'strict', path: '/api/analytics', maxAge: TTL });
    res.status(200).json({ authenticated: true, expiresInSeconds: TTL / 1000 });
  };
  const logout: RequestHandler = (req, res) => {
    sessions.delete(sessionKey(req));
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', path: '/api/analytics' });
    res.status(204).end();
  };
  return { localOnly, requireSession, login, logout };
};
