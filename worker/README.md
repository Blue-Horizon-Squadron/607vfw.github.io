# BHS Registration Backend (Cloudflare Worker)

This folder contains a Cloudflare Worker that acts as the server-side backend for operation registrations.

It provides:

- **Atomic slot enforcement** (first-come-first-served).
- **Upsert registrations** (same pilot updates/replaces their existing signup for the same operation).
- Optional **Discord webhook notification**.
- **Google Sheets upsert** (updates existing row, otherwise inserts a new one).
- **Tamper-proof role capacity enforcement** via KV (recommended).

> Note: GitHub Pages is static, so this Worker is required for real slot enforcement.

## Endpoints

- `POST /register`
  - Body: JSON

    ```json
    {
      "operation_id": "op-002",
      "operation_name": "Masked Hydra - Canyon Runs",
      "discord": "callsign",
      "callsign": "VIPER 1-1",
      "role": "HYDRA - SEAD",
      "aircraft": "F-16C Viper",
      "experience": "intermediate",
      "notes": "...",
      "notify": true,
      "timestamp": "2026-03-24T12:00:00.000Z"
    }
    ```

Response:

- Success: `{ "ok": true }`
- Failure: `{ "ok": false, "message": "..." }`

## Durable Object behaviour

Registrations are keyed by the pilot `discord` (per operation Durable Object).

## Trusted role capacities (KV) (recommended)

To prevent users tampering with `role_slots` in the browser, the Worker can load role capacities from a trusted KV entry.

### 1) Create a KV namespace

Cloudflare Dashboard → Storage & Databases → KV → Create namespace (e.g. `bhs-ops-config`).

Put the namespace ID into `worker/wrangler.toml` under the `OPS_CONFIG` binding.

### 2) Generate ops-config.json from your Jekyll data

A helper script is provided:

- `worker/tools/operations-to-ops-config.ps1`

It converts `_data/operations.yml` into a JSON mapping like:

```json
{
  "op-001": { "roles": { "SEAD": 10, "STRIKE": 10 } },
  "op-002": { "roles": { "HYDRA - SEAD": 4 } }
}
```

### 3) Upload to KV

Key name: `OPS_CONFIG_JSON`

Value: the contents of `ops-config.json`.

After upload, redeploy the Worker.

### Fallback mode (not recommended)

If you *must* temporarily allow client-provided capacities, set:

- `ALLOW_CLIENT_ROLE_SLOTS=true`

## Cloudflare setup (overview)

1. Create a Worker (Dashboard → Workers & Pages → Create).
2. Set the Worker entrypoint to `worker/src/index.js`.
3. Add Worker **environment variables** (Settings → Variables):

   - `BHS_SHARED_SECRET` (string) – required
   - `DISCORD_WEBHOOK_URL` (string) – optional
   - `GSHEET_ID` (string) – optional
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (secret) – optional
   - `ALLOWED_ORIGINS` (string, comma-separated) – recommended
     - If set, cross-origin requests are rejected with 403 unless the request `Origin` is in the list.

### Discord notification behavior

By default the Worker notifies Discord **only for new registrations** (not updates).

You can change this with Worker variables:

- `DISCORD_NOTIFY_ON_UPDATE=true` — notify on any update
- `DISCORD_NOTIFY_ON_ROLE_CHANGE=true` — notify only when an update changes role/aircraft

If both are unset/false, only creates notify.

1. Deploy.

Then set these in the website repo (`_config.yml`):

- `registration.endpoint`: your Worker URL, e.g. `https://bhs-registration.<name>.workers.dev/register`

> The site no longer needs `registration.shared_secret` committed in git. Keep `BHS_SHARED_SECRET` only in Cloudflare.

## Google Sheets (service account)

1. In Google Cloud Console, create a project.
2. Enable **Google Sheets API**.
3. Create a **Service Account** + JSON key.
4. Share your sheet with the service account email as **Editor**.

Worker vars:

- `GSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- optional: `GSHEET_TAB` (defaults to `Registrations`)

## Sheet format

The Worker appends one row per registration:

- Timestamp
- Operation ID
- Operation Name
- Discord
- Callsign
- Role
- Aircraft
- Experience
- Notes
- Notify

You can change the order in `worker/src/googleSheets.js`.

## Safe deployments + required bindings (important)

This Worker relies on variables/bindings you set in the Cloudflare Dashboard (KV + Google Sheets IDs, allowed origins, etc.).

When deploying from this repo, always use:

- `wrangler deploy --keep-vars`

If Wrangler shows a warning that local config differs from remote config, **do not** proceed without `--keep-vars` unless you intentionally want to replace the dashboard settings.

### Required Cloudflare bindings

- Durable Object: `REG_STORE` → class `RegistrationStore`
- KV namespace binding name **must** be: `OPS_CONFIG`
  - KV must contain key: `OPS_CONFIG_JSON`

### Required secrets / variables

Secrets (Dashboard → Worker → Settings → Variables → Secrets):

- `BHS_SHARED_SECRET`
- `DISCORD_WEBHOOK_URL` (optional)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (required for Sheets)

Plain variables (Dashboard → Worker → Settings → Variables):

- `GSHEET_ID` (required for Sheets)
- `GSHEET_TAB` (required for Sheets)
- `ALLOWED_ORIGINS` (recommended)
- `DISCORD_NOTIFY_ON_UPDATE` (optional)
- `DISCORD_NOTIFY_ON_ROLE_CHANGE` (optional)

### Helpful admin endpoints (protected by X-BHS-Auth)

- `GET /admin/config-status` — confirms KV + vars are present at runtime
- `POST /admin/reset` with body `{ "operation_id": "op-001" }` — clears stored regs/roles for that operation

Quick runtime verification (requires `BHS_SHARED_SECRET`):

- `GET /admin/config-status`

```text
# Example
curl -H "X-BHS-Auth: <BHS_SHARED_SECRET>" https://<worker>/admin/config-status
```
