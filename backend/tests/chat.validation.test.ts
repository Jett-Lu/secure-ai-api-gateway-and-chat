import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.UPSTREAM_API_URL = 'https://api.openai.com/v1/chat/completions';
process.env.UPSTREAM_MODEL = 'gpt-4o-mini';

const { chatSchema } = await import('../src/validation/chat.js');

describe('chatSchema', () => {
  it('rejects unknown top-level and message fields', () => {
    const input = { apiKey: 'sk_test_abcdefghijklmnopqrstuvwxyz', messages: [{ role: 'user', content: 'hello' }] };
    expect(chatSchema.safeParse({ ...input, administrator: true }).success).toBe(false);
    expect(chatSchema.safeParse({ ...input, messages: [{ ...input.messages[0], token: 'secret' }] }).success).toBe(false);
  });
  it('accepts valid chat payload', () => {
    const result = chatSchema.safeParse({
      apiKey: 'sk_test_abcdefghijklmnopqrstuvwxyz',
      messages: [{ role: 'user', content: 'Hello there' }]
    });

    expect(result.success).toBe(true);
  });

  it('rejects payload with non-user final message', () => {
    const result = chatSchema.safeParse({
      apiKey: 'sk_test_abcdefghijklmnopqrstuvwxyz',
      messages: [
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'Hi' }
      ]
    });

    expect(result.success).toBe(false);
  });

  it('rejects API key with invalid characters', () => {
    const result = chatSchema.safeParse({
      apiKey: 'bad key with spaces',
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(result.success).toBe(false);
  });
});
