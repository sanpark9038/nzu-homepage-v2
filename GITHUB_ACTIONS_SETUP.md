# NZU Ops GitHub Actions Setup

## Goal
Run the daily ops pipeline without depending on a local PC power/login state.

## Workflows
- `.github/workflows/ops-pipeline.yml`
  - Schedule: every day `06:10 KST` (`21:10 UTC`)
  - Runs: `node scripts/tools/run-ops-pipeline.js`
- `.github/workflows/ops-freshness-check.yml`
  - Schedule: every day `07:30 KST` (`22:30 UTC`)
  - Runs: `node scripts/tools/check-ops-github-actions-freshness.js`
  - Checks whether today's scheduled ops workflow run completed successfully.

## Required Repository Secrets
Set these in GitHub: `Settings -> Secrets and variables -> Actions -> New repository secret`

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPS_DISCORD_WEBHOOK_URL`

## Manual Trigger
- GitHub -> `Actions` -> `NZU Ops Pipeline` -> `Run workflow`
- Optional inputs:
  - `skip_supabase`
  - `dry_run`

## Security Notes
- Never commit `.env.local`.
- Keep workflow permissions minimal (`contents: read`).
- Avoid exposing secret values in logs.

