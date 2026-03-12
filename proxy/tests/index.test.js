// proxy/tests/index.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing handler
vi.mock('../src/validate.js', () => ({
  validatePayload: vi.fn(() => ({ valid: true })),
  verifyHmac: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../src/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true, remaining: 29 })),
  incrementCounters: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/openai.js', () => ({
  createChatStream: vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: new ReadableStream(),
    })
  ),
}));

import handler from '../src/index.js';
import { validatePayload, verifyHmac } from '../src/validate.js';
import { checkRateLimit, incrementCounters } from '../src/rate-limit.js';
import { createChatStream } from '../src/openai.js';

function makeRequest(path, options = {}) {
  const url = `https://proxy.workers.dev${path}`;
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', '1.2.3.4');
  const body = options.body ? JSON.stringify(options.body) : undefined;
  return new Request(url, { method, headers, body });
}

function makeEnv(overrides = {}) {
  return {
    OPENAI_API_KEY: 'sk-test',
    HMAC_SECRET: 'test-secret',
    ENABLED: 'true',
    ALLOWED_ORIGINS: 'chrome-extension://test-id,https://localhost',
    RATE_LIMIT_KV: {},
    ...overrides,
  };
}

describe('CORS preflight', () => {
  it('returns 204 with CORS headers for OPTIONS', async () => {
    const req = makeRequest('/chat', { method: 'OPTIONS' });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('returns CORS headers matching request origin', async () => {
    const req = makeRequest('/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'chrome-extension://test-id' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://test-id');
  });

  it('does not match unknown origins', async () => {
    const req = makeRequest('/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.com' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.com');
  });
});

describe('kill switch', () => {
  it('returns 503 when ENABLED is false', async () => {
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'x', timestamp: 1 },
    });
    const res = await handler.fetch(req, makeEnv({ ENABLED: 'false' }));
    expect(res.status).toBe(503);
  });
});

describe('routing', () => {
  it('returns 404 for non-/chat paths', async () => {
    const req = makeRequest('/other', { method: 'POST' });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it('returns 405 for GET /chat', async () => {
    const req = makeRequest('/chat', { method: 'GET' });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(405);
  });
});

describe('POST /chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validatePayload.mockReturnValue({ valid: true });
    verifyHmac.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
    incrementCounters.mockResolvedValue();
    createChatStream.mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
    });
  });

  it('returns 400 when payload validation fails', async () => {
    validatePayload.mockReturnValue({ valid: false, error: 'bad payload' });
    const req = makeRequest('/chat', {
      method: 'POST',
      body: {},
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it('returns 403 when HMAC fails', async () => {
    verifyHmac.mockResolvedValue(false);
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'bad', timestamp: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, reason: 'Daily limit', remaining: 0 });
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'x', timestamp: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.remaining).toBe(0);
  });

  it('streams SSE response on success', async () => {
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'x', timestamp: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(incrementCounters).toHaveBeenCalled();
  });

  it('returns remaining count in X-RateLimit-Remaining header', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 15 });
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'x', timestamp: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('15');
  });

  it('forwards OpenAI error status', async () => {
    createChatStream.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('OpenAI error'),
    });
    const req = makeRequest('/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }], signature: 'x', timestamp: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(502);
  });

  it('returns 413 for oversized request body', async () => {
    const oversizedBody = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(20000) }] });
    const req = new Request('https://proxy.workers.dev/chat', {
      method: 'POST',
      headers: new Headers({ 'CF-Connecting-IP': '1.2.3.4', 'Content-Type': 'application/json' }),
      body: oversizedBody,
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(413);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('https://proxy.workers.dev/chat', {
      method: 'POST',
      headers: new Headers({ 'CF-Connecting-IP': '1.2.3.4', 'Content-Type': 'text/plain' }),
      body: 'not json',
    });
    const res = await handler.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });
});
