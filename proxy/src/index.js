// proxy/src/index.js
import { validatePayload, verifyHmac } from './validate.js';
import { checkRateLimit, incrementCounters } from './rate-limit.js';
import { createChatStream } from './openai.js';

const MAX_BODY_SIZE = 10240; // 10KB

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(request, env) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
}

function jsonResponse(data, status = 200, corsHeaders = {}, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extraHeaders },
  });
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return corsResponse(request, env);
    }

    const url = new URL(request.url);

    if (url.pathname !== '/chat') {
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    if (env.ENABLED === 'false') {
      return jsonResponse({ error: 'Service temporarily disabled' }, 503, corsHeaders);
    }

    // Check body size (10KB limit)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse({ error: 'Request body too large (max 10KB)' }, 413, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const validation = validatePayload(body);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders);
    }

    const hmacValid = await verifyHmac(body, env.HMAC_SECRET);
    if (!hmacValid) {
      return jsonResponse({ error: 'Invalid signature' }, 403, corsHeaders);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateResult = await checkRateLimit(ip, env.RATE_LIMIT_KV);
    if (!rateResult.allowed) {
      return jsonResponse(
        { error: rateResult.reason, remaining: rateResult.remaining ?? 0 },
        429,
        corsHeaders,
        { 'Retry-After': String(rateResult.retryAfter || 60) }
      );
    }

    await incrementCounters(ip, env.RATE_LIMIT_KV);

    const openaiResponse = await createChatStream(body.messages, env.OPENAI_API_KEY);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => 'Unknown error');
      return jsonResponse({ error: 'Upstream error', detail: errorText }, 502, corsHeaders);
    }

    return new Response(openaiResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-RateLimit-Remaining': String(rateResult.remaining),
        ...corsHeaders,
      },
    });
  },
};
