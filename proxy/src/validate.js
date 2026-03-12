// proxy/src/validate.js
const MAX_MESSAGES = 20;
const MAX_TOTAL_CHARS = 6000;
const TIMESTAMP_WINDOW_SECONDS = 300; // 5 minutes

const validRoles = ['system', 'user', 'assistant'];

export function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { messages, signature, timestamp } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'Missing or empty messages array' };
  }

  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: `Too many messages (max ${MAX_MESSAGES})` };
  }

  for (const m of messages) {
    if (!validRoles.includes(m.role)) {
      return { valid: false, error: `Invalid role: ${m.role}` };
    }
    if (typeof m.content !== 'string') {
      return { valid: false, error: 'Message content must be a string' };
    }
  }

  const totalChars = messages.reduce((sum, m) => sum + (m.content || '').length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return { valid: false, error: `Content too long (max ${MAX_TOTAL_CHARS} chars)` };
  }

  if (!signature || typeof signature !== 'string') {
    return { valid: false, error: 'Missing signature' };
  }

  if (!timestamp || typeof timestamp !== 'number') {
    return { valid: false, error: 'Missing timestamp' };
  }

  return { valid: true };
}

export async function computeHmac(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyHmac(body, secret) {
  const { messages, signature, timestamp } = body;
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > TIMESTAMP_WINDOW_SECONDS) {
    return false;
  }

  const payload = `${timestamp}${JSON.stringify(messages).substring(0, 100)}`;
  const expected = await computeHmac(payload, secret);
  return expected === signature;
}
