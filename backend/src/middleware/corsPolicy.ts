import cors from 'cors';
import { getConfig } from '../config/env.js';
import { AppError } from '../types/errors.js';

const config = getConfig();

const originPolicy = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
    if (config.NODE_ENV === 'production' && !origin) {
      callback(new AppError('Origin header is required.', 403, 'validation_error'));
      return;
    }

    if (config.NODE_ENV !== 'production' && !origin) {
      callback(null, true);
      return;
    }

    if (origin === config.FRONTEND_ORIGIN) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origin is not allowed.', 403, 'validation_error'));
};

export const corsPolicyMiddleware = cors<import('express').Request>((req, callback) => callback(null, {
  origin: originPolicy,
  methods: ['GET', 'POST'],
  credentials: req.path.startsWith('/api/analytics/')
}));
