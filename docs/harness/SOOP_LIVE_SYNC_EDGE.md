# SOOP Live Sync Edge Runtime

## Decision

Frequent SOOP live-state sync now belongs to Supabase Cron plus the
`soop-live-sync` Supabase Edge Function.

GitHub Actions remains available only as a manual fallback through
`.github/workflows/soop-live-sync.yml`.

The public source of truth for live state is:

- `players.is_live`
- `players.broadcast_title`
- `players.live_thumbnail_url`
- `players.last_checked_at`

Local generated or preview SOOP JSON files are no longer serving-time live
truth for `/tier` or player pages.

## Runtime Flow

1. Supabase Cron calls `/functions/v1/soop-live-sync` every 10 minutes.
2. The function validates:
   - `Authorization: Bearer <anon key>`
   - `apikey: <anon key>`
   - `x-sync-secret: <SOOP_SYNC_SECRET>`
3. The function reads `players` rows with `soop_id`.
4. It scans SOOP `broad/list` with a bounded page limit.
5. It computes live state for each registered SOOP ID.
6. It updates only rows whose live fields changed, plus live rows that need a
   heartbeat refresh.
7. It writes one `soop_live_sync_runs` record.
8. It revalidates `public-players-list` through `/api/admin/revalidate-serving`.

If the scan hits the configured page limit before reaching an empty page, any
SOOP IDs that were not seen are treated as unresolved, not offline. Those rows
are preserved for that run and counted in `unresolved_count`.

## Required Edge Function Secrets

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SOOP_CLIENT_ID`
- `SOOP_SYNC_SECRET`
- `SERVING_REVALIDATE_URL`
- `SERVING_REVALIDATE_SECRET`

Optional:

- `SOOP_BROAD_LIST_PAGE_LIMIT` defaults to `200`
- `SOOP_SYNC_HEARTBEAT_MINUTES` defaults to `10`
- `SOOP_SYNC_ALLOW_REVALIDATION_SKIP=true` allows DB-only smoke tests to skip
  public cache revalidation. Do not enable this for production cron.

## Database Setup

Apply:

```sql
scripts/sql/create-soop-live-sync-runs.sql
```

That migration creates `public.soop_live_sync_runs`, enables RLS, revokes
anon/authenticated/public table access, grants service-role access, indexes
recent runs, and includes retention cleanup for both "older than 3 days" and
"more than 300 runs" cases.

The same SQL file includes a commented Supabase Cron example. Keep project URL,
anon key, and sync secret in Supabase Vault rather than hardcoding them in SQL.

## GitHub Manual Fallback

The `SOOP Live Sync` workflow has no schedule. It can be run manually and calls
the Edge Function directly with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SOOP_SYNC_SECRET`

It does not run `npm ci`, generate local snapshots, upload artifacts, or perform
Node-based Supabase sync.

## Public Freshness Guard

`lib/player-live-overlay.ts` keeps a 15-minute stale-live guard. If a DB row says
`is_live=true` but `last_checked_at` is missing, invalid, future-dated, or older
than 15 minutes, public serving code clears the live display.

The Edge Function heartbeat refresh keeps unchanged live broadcasts from aging
out under that guard while avoiding writes for unchanged offline rows.

## Verification

Targeted checks:

```powershell
npm.cmd run test:player-live-overlay
npm.cmd run test:soop-live-sync
npm.cmd run test:soop-edge-function-contract
npm.cmd run test:admin-revalidation-proxy
npm.cmd run test:staging-sync
npm.cmd run test:prod-sync
```

Broader checks before deployment:

```powershell
npx tsc --noEmit
npm.cmd run build
```
