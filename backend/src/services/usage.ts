import type { TokenUsage } from '../types/analytics.js';

const counter = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;

export const normalizeUsage = (input: unknown): TokenUsage => {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const promptTokens = counter(data.prompt_tokens);
  const completionTokens = counter(data.completion_tokens);
  let totalTokens = counter(data.total_tokens);
  if (totalTokens !== null && (
    (promptTokens !== null && totalTokens < promptTokens) ||
    (completionTokens !== null && totalTokens < completionTokens) ||
    (promptTokens !== null && completionTokens !== null && totalTokens !== promptTokens + completionTokens)
  )) totalTokens = null;
  return { promptTokens, completionTokens, totalTokens };
};
