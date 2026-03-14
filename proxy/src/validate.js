// proxy/src/validate.js
const MAX_MESSAGES = 20;
const MAX_TOTAL_CHARS = 6000;
const TIMESTAMP_WINDOW_SECONDS = 300; // 5 minutes

const validRoles = ['system', 'user', 'assistant'];

const MAX_IMAGES_PER_MESSAGE = 2;

function validateContentItem(item) {
  if (!item || typeof item !== 'object' || !item.type) {
    return { valid: false, error: 'Invalid content item' };
  }
  if (item.type === 'text') {
    if (typeof item.text !== 'string') {
      return { valid: false, error: 'Content item text must be a string' };
    }
    return { valid: true };
  }
  if (item.type === 'image_url') {
    if (!item.image_url || typeof item.image_url.url !== 'string') {
      return { valid: false, error: 'Invalid image_url item' };
    }
    const url = item.image_url.url;
    if (!url.startsWith('https:') && !url.startsWith('data:image/')) {
      return { valid: false, error: 'Image URL must start with https: or data:image/' };
    }
    return { valid: true };
  }
  return { valid: false, error: `Unknown content type: ${item.type}` };
}

function validateContent(content) {
  if (typeof content === 'string') {
    return { valid: true };
  }
  if (Array.isArray(content)) {
    if (content.length === 0) {
      return { valid: false, error: 'Content array must not be empty' };
    }
    let imageCount = 0;
    for (const item of content) {
      const result = validateContentItem(item);
      if (!result.valid) return result;
      if (item.type === 'image_url') imageCount++;
    }
    if (imageCount > MAX_IMAGES_PER_MESSAGE) {
      return { valid: false, error: `Too many images (max ${MAX_IMAGES_PER_MESSAGE} per message)` };
    }
    return { valid: true };
  }
  return { valid: false, error: 'Message content must be a string or array' };
}

function getContentChars(messages) {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      total += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const item of m.content) {
        if (item.type === 'text') {
          total += (item.text || '').length;
        }
      }
    }
  }
  return total;
}

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
    const contentResult = validateContent(m.content);
    if (!contentResult.valid) {
      return contentResult;
    }
  }

  const totalChars = getContentChars(messages);
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

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyHmac(body, secret) {
  const { messages, signature, timestamp } = body;
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > TIMESTAMP_WINDOW_SECONDS) {
    return false;
  }

  const payload = `${timestamp}${JSON.stringify(messages)}`;
  const expected = await computeHmac(payload, secret);
  return timingSafeEqual(expected, signature);
}
