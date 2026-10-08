import { Router } from 'express';
import type { AppConfig } from '../config/env.js';
import { createAnalyticsAuth } from '../middleware/analyticsAuth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { analyticsLogin, analyticsQuery } from '../validation/analytics.js';
import type { AnalyticsService } from '../services/analytics.js';

export const createAnalyticsRouter = (config: AppConfig, service: AnalyticsService) => {
  const router = Router();
  const auth = createAnalyticsAuth(config);
  router.use(auth.localOnly);
  router.post('/session', validateRequest(analyticsLogin), (req, res) => auth.login(req.body.secret, req, res));
  router.post('/logout', auth.logout);
  router.use(auth.requireSession);
  for (const kind of ['summary', 'usage', 'models', 'errors'] as const) {
    router.get(`/${kind}`, async (req, res, next) => {
      try {
        const filter = analyticsQuery.parse(req.query);
        const result = await service.query(kind, filter);
        if (!res.headersSent && !req.requestSignal.aborted) res.json(result);
      } catch (error) { next(error); }
    });
  }
  return router;
};
