/**
 * BHS Registration Worker
 *
 * POST /register
 * - Validates payload
 * - Enforces role capacity atomically (Durable Object)
 * - Upserts registration by (operation_id + discord)
 * - Optionally posts to Discord webhook
 * - Optionally appends to Google Sheets
 */

import { RegistrationStore } from './store.js';
import { jsonResponse, readJson, requireAuth, corsHeaders, isAllowedOrigin } from './util.js';
import { postDiscord } from './discord.js';
import { upsertRegistrationRow } from './googleSheets.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Basic CORS
    const origin = request.headers.get('Origin');
    const allowOrigin = isAllowedOrigin(origin, env) ? origin : '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
    }

    if (url.pathname === '/register' && request.method === 'POST') {
      try {
        requireAuth(request, env);

        const body = await readJson(request);

        const required = ['operation_id', 'operation_name', 'discord', 'callsign', 'role', 'aircraft'];
        for (const k of required) {
          if (!body[k] || String(body[k]).trim() === '') {
            return jsonResponse({ ok: false, message: `Missing field: ${k}` }, 400, allowOrigin);
          }
        }

        // Rate-limit / spam mitigation (lightweight)
        if (String(body.discord).length > 64 || String(body.callsign).length > 64) {
          return jsonResponse({ ok: false, message: 'Input too long.' }, 400, allowOrigin);
        }

        // Durable Object per operation
        const opId = String(body.operation_id);
        const id = env.REG_STORE.idFromName(opId);
        const stub = env.REG_STORE.get(id);

        const storeRes = await stub.fetch('https://do/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const storeJson = await storeRes.json().catch(() => ({ ok: false, message: 'Store error' }));
        if (!storeRes.ok || !storeJson.ok) {
          return jsonResponse({ ok: false, message: storeJson.message || 'Registration failed.' }, storeRes.status || 400, allowOrigin);
        }

        // Side effects
        const payloadForNotify = { ...body, ...storeJson.result };

        if (env.DISCORD_WEBHOOK_URL) {
          ctx.waitUntil(postDiscord(env.DISCORD_WEBHOOK_URL, payloadForNotify));
        }

        if (env.GSHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
          ctx.waitUntil(upsertRegistrationRow(env, payloadForNotify));
        }

        return jsonResponse({ ok: true }, 200, allowOrigin);
      } catch (e) {
        return jsonResponse({ ok: false, message: e?.message || 'Server error.' }, 500, allowOrigin);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(allowOrigin) });
  }
};

export { RegistrationStore };
