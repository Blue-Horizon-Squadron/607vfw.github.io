/**
 * Google Sheets append.
 *
 * Requires env:
 * - GSHEET_ID
 * - GOOGLE_SERVICE_ACCOUNT_JSON (full JSON key string)
 *
 * This implementation uses Google OAuth JWT (service account) to call
 * Sheets v4 `spreadsheets.values.append`.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function appendRegistrationRow(env, data) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const accessToken = await getAccessToken(sa);

  const values = [[
    new Date().toISOString(),
    data.operation_id || '',
    data.operation_name || '',
    data.discord || '',
    data.callsign || '',
    data.role || '',
    data.aircraft || '',
    data.experience || '',
    data.notes || '',
    data.notify ? 'yes' : 'no'
  ]];

  const range = encodeURIComponent('Registrations!A1');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values })
  });
}

// Upsert (update existing row by key; otherwise append)
export async function upsertRegistrationRow(env, data) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const accessToken = await getAccessToken(sa);

  const sheetName = env.GSHEET_TAB || 'Registrations';

  // Ensure header exists
  await ensureHeader(env, accessToken, sheetName);

  const key = {
    operation_id: String(data.operation_id || ''),
    discord: String(data.discord || ''),
    callsign: String(data.callsign || '')
  };

  // Pull all rows (simple + reliable for modest volume)
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${encodeURIComponent(sheetName)}!A:K`;
  const getRes = await fetch(getUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const getJson = await getRes.json();
  const rows = (getJson && getJson.values) ? getJson.values : [];

  // columns:
  // A timestamp
  // B operation_id
  // C operation_name
  // D discord
  // E callsign
  // F role
  // G aircraft
  // H experience
  // I notes
  // J notify
  // K updated_at

  const wantOp = key.operation_id;
  const wantDiscord = key.discord;
  const wantCallsign = key.callsign;

  let foundRowIndex = -1; // 1-based for Sheets
  for (let i = 1; i < rows.length; i++) { // skip header row
    const r = rows[i] || [];
    const op = r[1] || '';
    const discord = r[3] || '';
    const callsign = r[4] || '';
    if (op === wantOp && discord === wantDiscord && callsign === wantCallsign) {
      foundRowIndex = i + 1;
      break;
    }
  }

  const rowValues = [[
    new Date().toISOString(),
    wantOp,
    String(data.operation_name || ''),
    wantDiscord,
    wantCallsign,
    String(data.role || ''),
    String(data.aircraft || ''),
    String(data.experience || ''),
    String(data.notes || ''),
    data.notify ? 'yes' : 'no',
    new Date().toISOString()
  ]];

  if (foundRowIndex > 0) {
    const updateRange = `${sheetName}!A${foundRowIndex}:K${foundRowIndex}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=RAW`;
    await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: rowValues })
    });
    return;
  }

  // Not found → append
  const range = encodeURIComponent(`${sheetName}!A1`);
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await fetch(appendUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: rowValues })
  });
}

async function ensureHeader(env, accessToken, sheetName) {
  const headUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:K1`;
  const res = await fetch(headUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  const json = await res.json();
  const values = json && json.values ? json.values : [];
  if (values.length && values[0] && values[0].length) return;

  const header = [[
    'timestamp',
    'operation_id',
    'operation_name',
    'discord',
    'callsign',
    'role',
    'aircraft',
    'experience',
    'notes',
    'notify',
    'updated_at'
  ]];

  const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:K1?valueInputOption=RAW`;
  await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: header })
  });
}

async function getAccessToken(sa) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60;
  const scope = 'https://www.googleapis.com/auth/spreadsheets';

  const jwtHeader = { alg: 'RS256', typ: 'JWT' };
  const jwtClaim = {
    iss: sa.client_email,
    scope,
    aud: GOOGLE_TOKEN_URL,
    exp,
    iat
  };

  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(jwtHeader)}.${enc(jwtClaim)}`;

  const key = await importPkcs8(sa.private_key);
  const sigBuf = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(signingInput));
  const signedJwt = `${signingInput}.${b64url(new Uint8Array(sigBuf))}`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    })
  });

  const json = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Google token error: ${json.error || tokenRes.status}`);
  }
  return json.access_token;
}

function b64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importPkcs8(pem) {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) binaryDer[i] = binaryDerString.charCodeAt(i);

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
