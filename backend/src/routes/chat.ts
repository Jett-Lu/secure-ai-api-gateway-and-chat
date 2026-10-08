import { Router } from 'express';
import { requestChatCompletion } from '../services/upstreamClient.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { chatSchema } from '../validation/chat.js';
import { normalizeUsage } from '../services/usage.js';

export const chatRouter = Router();

chatRouter.post('/', validateRequest(chatSchema), async (req, res, next) => {
  try {
    const payload = req.body;
    const result = await requestChatCompletion(payload.apiKey, payload.messages, req.requestSignal);
    if (req.requestSignal.aborted || res.headersSent) return;
    req.tokenUsage = normalizeUsage(result.usage);

    res.status(200).json({
      reply: result.reply,
      usage: {
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens
      },
      requestId: req.requestId
    });
  } catch (error) {
    if (req.requestSignal.aborted && !res.headersSent) {
      return;
    }

    next(error);
  }
});
