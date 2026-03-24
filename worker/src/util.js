export function corsHeaders(allowOrigin) {
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-BHS-Auth',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

export function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(origin);
}

export function jsonResponse(obj, status, allowOrigin) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders(allowOrigin) });
}

export async function readJson(request) {
  const text = await request.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error('Invalid JSON.');
  }
}

function timingSafeEqual(a, b) {
  // Simple constant-time-ish compare for small secrets
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function issueAdminCookie(env) {
  const secret = env.BHS_SHARED_SECRET;
  if (!secret) return null;

  const now = Date.now();
  const ttlMs = Number(env.ADMIN_COOKIE_TTL_MS || 1000 * 60 * 60 * 24 * 7); // 7 days default
  const exp = now + ttlMs;
  const payload = `exp=${exp}`;
  const sig = await hmacHex(secret, payload);
  const value = `${payload}&sig=${sig}`;

  const isProd = String(env.COOKIE_SECURE || '').toLowerCase() === 'true';
  const secure = isProd ? ' Secure;' : '';

  return `bhs_admin=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)};${secure}`;
}

export async function isAdminCookieValid(request, env) {
  const secret = env.BHS_SHARED_SECRET;
  if (!secret) return true; // auth disabled

  const cookies = parseCookies(request.headers.get('Cookie'));
  const raw = cookies.bhs_admin;
  if (!raw) return false;

  const [payload, sigPart] = String(raw).split('&sig=');
  if (!payload || !sigPart) return false;

  const expected = await hmacHex(secret, payload);
  if (!timingSafeEqual(expected, sigPart)) return false;

  const m = /exp=(\d+)/.exec(payload);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  return true;
}

export async function requireAuth(request, env) {
  const want = env.BHS_SHARED_SECRET;
  if (!want) return; // allow if unset

  const got = request.headers.get('X-BHS-Auth');
  if (got && timingSafeEqual(got, want)) return;

  // Fallback: cookie-based admin session
  const ok = await isAdminCookieValid(request, env);
  if (!ok) {
    throw new Error('Unauthorized');
  }
}
