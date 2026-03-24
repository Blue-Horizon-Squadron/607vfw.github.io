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

4. Deploy.

Then set these in the website repo (`_config.yml`):

- `registration.endpoint`: your Worker URL, e.g. `https://bhs-registration.<name>.workers.dev/register`
- `registration.shared_secret`: the same value as `BHS_SHARED_SECRET`

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
