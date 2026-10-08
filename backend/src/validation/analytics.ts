import { z } from 'zod';

export const analyticsQuery = z.object({
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  model: z.string().min(1).max(128).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  bucket: z.enum(['hour', 'day']).default('day'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0)
}).strict().transform(input => {
  const end = input.end ? new Date(input.end) : new Date();
  const start = input.start ? new Date(input.start) : new Date(end.getTime() - 7 * 86400000);
  return { ...input, start, end };
}).refine(input => input.start < input.end && input.end.getTime() - input.start.getTime() <= 90 * 86400000, {
  message: 'Date range must be positive and at most 90 days.'
});

export const analyticsLogin = z.object({ secret: z.string().min(1).max(256) }).strict();
