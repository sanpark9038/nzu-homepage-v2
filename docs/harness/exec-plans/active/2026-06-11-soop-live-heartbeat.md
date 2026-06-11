# SOOP Live Heartbeat Gap

## Objective

Reduce the chance that unchanged live broadcasters disappear from `/tier` between successful 10-minute SOOP sync runs.

## Current Evidence

- Supabase Cron is running `soop-live-sync` every 10 minutes.
- Recent runs are successful and revalidate `public-players-list`.
- Some `players.is_live=true` rows can still have `last_checked_at` older than the public 15-minute stale-live guard because the Edge Function default heartbeat is also 10 minutes.

## Scope

- Keep the Supabase Cron cadence at 10 minutes.
- Lower the Edge Function default live heartbeat refresh threshold to 5 minutes.
- Update docs and contract tests.
- Do not change public UI labels, SOOP scan page limit, cache tags, or cron setup in this slice.

## Verification

- `npm.cmd run test:soop-edge-function-contract`
- `npm.cmd run test:player-live-overlay`
- `npm.cmd run test:soop-live-sync`
- TypeScript/lint/build checks if the targeted tests pass.
