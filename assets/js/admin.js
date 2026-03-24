/**
 * BHS Admin tools (static page)
 *
 * Calls protected Worker endpoints:
 *  - POST /admin/login
 *  - POST /admin/logout
 *  - GET  /admin/config-status
 *  - POST /admin/reset
 */

(function () {
  'use strict';

  const cfgEl = document.getElementById('bhs-config');
  const REG_ENDPOINT = cfgEl ? (cfgEl.getAttribute('data-registration-endpoint') || '') : '';

  function adminBase() {
    if (!REG_ENDPOINT) return '';
    try {
      const u = new URL(REG_ENDPOINT);
      // REG_ENDPOINT points to /register
      u.pathname = '';
      return u.toString().replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  const BASE = adminBase();
  const STORAGE_KEY = 'bhs_admin_secret';

  const elSecret = document.getElementById('admin-secret');
  const btnSave = document.getElementById('btn-save-secret');
  const btnClear = document.getElementById('btn-clear-secret');
  const btnRefresh = document.getElementById('btn-refresh-status');
  const preStatus = document.getElementById('config-status');

  const elOpId = document.getElementById('reset-operation-id');
  const btnReset = document.getElementById('btn-reset');
  const elResetResult = document.getElementById('reset-result');

  function getSecret() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setSecret(v) {
    localStorage.setItem(STORAGE_KEY, v);
  }

  function clearSecret() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function authHeaders() {
    const s = getSecret();
    // Header auth still works, but cookie auth is preferred once logged in.
    return s ? { 'X-BHS-Auth': s } : {};
  }

  function setStatus(text) {
    if (preStatus) preStatus.textContent = text;
  }

  function friendlyError(e) {
    return (e && (e.message || String(e))) || 'Unknown error.';
  }

  async function fetchJson(path, opts) {
    if (!BASE) throw new Error('Missing registration endpoint config (site.registration.endpoint).');
    const res = await fetch(BASE + path, {
      credentials: 'include',
      ...opts,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  async function loginWithSecret(secret) {
    if (!secret) throw new Error('Secret is required.');
    return fetchJson('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
  }

  async function logout() {
    return fetchJson('/admin/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }

  async function refreshConfigStatus() {
    setStatus('Loading...');
    try {
      const j = await fetchJson('/admin/config-status', {
        method: 'GET',
        headers: {
          ...authHeaders(),
        },
      });
      setStatus(JSON.stringify(j, null, 2));
    } catch (e) {
      setStatus('Error: ' + friendlyError(e));
    }
  }

  async function resetOp(opId) {
    if (!opId) throw new Error('Operation ID is required.');
    elResetResult.textContent = 'Resetting...';
    try {
      const j = await fetchJson('/admin/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ operation_id: opId }),
      });
      elResetResult.textContent = `OK (cleared: ${j.cleared || 0})`;
    } catch (e) {
      elResetResult.textContent = `Error: ${friendlyError(e)}`;
    }
  }

  // Init UI
  if (elSecret) elSecret.value = getSecret();
  if (BASE && preStatus) {
    preStatus.textContent = 'Ready. Click Refresh.';
  } else if (preStatus) {
    preStatus.textContent = 'Missing site.registration.endpoint in site config.';
  }

  if (btnSave) {
    btnSave.textContent = 'Login (store secret)';
    btnSave.addEventListener('click', async function () {
      const v = (elSecret?.value || '').trim();
      try {
        setStatus('Logging in...');
        await loginWithSecret(v);
        setSecret(v);
        setStatus('Logged in (cookie set). You can refresh status or reset operations.');
      } catch (e) {
        setStatus('Login error: ' + friendlyError(e));
      }
    });
  }

  if (btnClear) {
    btnClear.textContent = 'Logout (clear cookie)';
    btnClear.addEventListener('click', async function () {
      try {
        setStatus('Logging out...');
        await logout();
      } catch (e) {
        // Ignore logout errors; still clear local secret
      }
      clearSecret();
      if (elSecret) elSecret.value = '';
      setStatus('Logged out.');
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', function () {
      refreshConfigStatus();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', function () {
      const opId = (elOpId?.value || '').trim();
      resetOp(opId);
    });
  }
})();
