export function corsHeaders(allowOrigin) {
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-BHS-Auth',
    'Access-Control-Max-Age': '86400',
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

export function requireAuth(request, env) {
  const want = env.BHS_SHARED_SECRET;
  if (!want) return; // allow if unset
  const got = request.headers.get('X-BHS-Auth');
  if (!got || got !== want) {
    throw new Error('Unauthorized');
  }
}
