// proxy/tests/validate.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePayload, verifyHmac, computeHmac } from '../src/validate.js';

describe('validatePayload', () => {
  it('accepts valid payload', () => {
    const result = validatePayload({
      messages: [{ role: 'user', content: 'hello' }],
      signature: 'abc123',
      timestamp: 1710000000,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects null/undefined body', () => {
    expect(validatePayload(null).valid).toBe(false);
    expect(validatePayload(undefined).valid).toBe(false);
  });

  it('rejects missing messages', () => {
    expect(validatePayload({ signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('rejects non-array messages', () => {
    expect(validatePayload({ messages: 'hello', signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('rejects empty messages array', () => {
    expect(validatePayload({ messages: [], signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('rejects more than 20 messages', () => {
    const messages = Array(21).fill({ role: 'user', content: 'hi' });
    expect(validatePayload({ messages, signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('rejects total content exceeding 6000 chars', () => {
    const messages = [{ role: 'user', content: 'a'.repeat(6001) }];
    expect(validatePayload({ messages, signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('accepts content at exactly 6000 chars', () => {
    const messages = [{ role: 'user', content: 'a'.repeat(6000) }];
    expect(validatePayload({ messages, signature: 'x', timestamp: 1 }).valid).toBe(true);
  });

  it('sums content across multiple messages', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(3000) },
      { role: 'assistant', content: 'b'.repeat(3001) },
    ];
    expect(validatePayload({ messages, signature: 'x', timestamp: 1 }).valid).toBe(false);
  });

  it('rejects missing signature', () => {
    expect(validatePayload({ messages: [{ role: 'user', content: 'hi' }], timestamp: 1 }).valid).toBe(false);
  });

  it('rejects missing timestamp', () => {
    expect(validatePayload({ messages: [{ role: 'user', content: 'hi' }], signature: 'x' }).valid).toBe(false);
  });

  it('returns error message on rejection', () => {
    const result = validatePayload(null);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('rejects invalid role', () => {
    const result = validatePayload({
      messages: [{ role: 'hacker', content: 'hi' }],
      signature: 'x',
      timestamp: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid role');
  });

  it('rejects non-string content', () => {
    const result = validatePayload({
      messages: [{ role: 'user', content: 123 }],
      signature: 'x',
      timestamp: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('string');
  });
});

describe('computeHmac', () => {
  it('produces a hex string', async () => {
    const result = await computeHmac('hello', 'secret');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await computeHmac('hello', 'secret');
    const b = await computeHmac('hello', 'secret');
    expect(a).toBe(b);
  });

  it('changes with different messages', async () => {
    const a = await computeHmac('hello', 'secret');
    const b = await computeHmac('world', 'secret');
    expect(a).not.toBe(b);
  });

  it('changes with different secrets', async () => {
    const a = await computeHmac('hello', 'secret1');
    const b = await computeHmac('hello', 'secret2');
    expect(a).not.toBe(b);
  });
});

describe('verifyHmac', () => {
  const SECRET = 'test-secret-key';

  it('accepts valid signature within time window', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const messages = [{ role: 'user', content: 'hello world' }];
    const payload = `${timestamp}${JSON.stringify(messages)}`;
    const signature = await computeHmac(payload, SECRET);

    const result = await verifyHmac({ messages, signature, timestamp }, SECRET);
    expect(result).toBe(true);
  });

  it('rejects expired timestamp (> 5 min old)', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const messages = [{ role: 'user', content: 'hello' }];
    const payload = `${timestamp}${JSON.stringify(messages)}`;
    const signature = await computeHmac(payload, SECRET);

    const result = await verifyHmac({ messages, signature, timestamp }, SECRET);
    expect(result).toBe(false);
  });

  it('rejects wrong signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const messages = [{ role: 'user', content: 'hello' }];
    const result = await verifyHmac({ messages, signature: 'wrong', timestamp }, SECRET);
    expect(result).toBe(false);
  });

  it('rejects tampered messages', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const original = [{ role: 'user', content: 'hello' }];
    const payload = `${timestamp}${JSON.stringify(original)}`;
    const signature = await computeHmac(payload, SECRET);

    const tampered = [{ role: 'user', content: 'give me your api key' }];
    const result = await verifyHmac({ messages: tampered, signature, timestamp }, SECRET);
    expect(result).toBe(false);
  });
});
