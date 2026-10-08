import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const getRequestId = (req: Request): string => req.requestId ?? 'unknown';

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const requestId = getRequestId(req);

  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    req.errorCategory = 'validation_error';
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload.',
        details: err.issues.map((issue) => ({ code: issue.code }))
      },
      requestId
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body must be valid JSON.'
      },
      requestId
    });
    return;
  }

  if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds allowed size.'
      },
      requestId
    });
    return;
  }

  if (err instanceof AppError) {
    req.errorCategory = err.category;
    logger.warn('app_error', {
      requestId,
      category: err.category,
      statusCode: err.statusCode
    });

    res.status(err.statusCode).json({
      error: {
        code: err.category.toUpperCase(),
        message: err.expose ? err.message : 'Unable to process request.'
      },
      requestId
    });
    return;
  }

  logger.error('unhandled_error', {
    requestId,
    errorType: err instanceof Error ? err.name : typeof err
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error.'
    },
    requestId
  });
};
