# BHS Registration Backend (Cloudflare Worker)

This folder contains a Cloudflare Worker that acts as the server-side backend for operation registrations.

It provides:
- **Atomic slot enforcement** (first-come-first-served).
- **Upsert registrations** (same pilot updates/replaces their existing signup for the same operation).
- Optional **Discord webhook notification**.
- Optional **Google Sheets** append (registrations log).

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

## Google Sheets (service account) – what you need to do

1. In Google Cloud Console, create a project.
2. Enable **Google Sheets API**.
3. Create a **Service Account**.
4. Create a **JSON key** for the service account.
5. Share your target Google Sheet with the service account email (`...@....iam.gserviceaccount.com`) as **Editor**.

Put the JSON key contents into the Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON`.

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
