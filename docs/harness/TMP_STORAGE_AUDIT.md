# TMP Storage Audit

This document explains which `tmp/` folders are actively used by the current NZU homepage pipeline and which ones are legacy or operator-only leftovers.

## Keep

### `tmp/.cache`

Keep this directory.

It is still used by current scripts:

- `scripts/tools/build-aggregates-incremental.js`
- `scripts/tools/report-team-records.js`
- `app/api/admin/pipeline/status/route.ts`
- `app/api/admin/pipeline/run/route.ts`

Current observed files:

- `tmp/.cache/roster_report_cache.json`
- `tmp/.cache/warehouse_state.json`

This cache may be large, but it still has runtime value.

### `tmp/reports`

Keep this directory, but prune it regularly.

Current pipeline and harness code read from it directly:

- `manual_refresh_baseline.json`
- `current_roster_state.json`
- `team_roster_sync_report.json`
- `daily_pipeline_snapshot_latest.json`
- `daily_pipeline_alerts_latest.json`
- `pipeline_collection_sources_health_latest.json`
- `low_sample_review_latest.json`

Relevant code paths:

- `scripts/tools/run-manual-refresh.js`
- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/verify-discord-summary.js`
- `scripts/tools/lib/discord-summary.js`

### Root-level `tmp/*.json` and `tmp/*.csv`

Keep the current contract-shaped root files that are still read by active scripts.

These include:

- `*_eloboard_*_matches.json`
- `*_roster_record_metadata.json`
- `*_roster_batch_export_report.json`
- `*_roster_batch_export_report.progress.jsonl`
- stable `*_상세전적.csv`
- `supabase_prod_sync_payload_preview.json`

Relevant code paths:

- `scripts/tools/export-team-roster-detailed.js`
- `scripts/tools/export-team-roster-metadata.js`
- `scripts/tools/build-aggregates-incremental.js`
- `scripts/tools/report-low-sample-players.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/update-player-check-priority.js`
- `scripts/tools/supabase-prod-sync.js`

Do not bulk-delete root files just because they live in `tmp/`.
Some of them are still runtime inputs or operator-facing debug outputs.

There is a second class of root files that are still structurally valid but redundant:

- name-based fallback match files such as `팀명_선수명_matches.json`
- plain detailed CSV files such as `선수명_상세전적.csv`

If a canonical file already exists for the same player, prefer the canonical version and remove the fallback duplicate:

- canonical match JSON: `팀명_eloboard_*_matches.json` or `팀명_wr_*_matches.json`
- canonical detailed CSV: `eloboard_*_선수명_상세전적.csv`

Use `npm run tmp:cleanup:duplicates` for this narrower cleanup.

This cleanup also covers legacy team-context files.

Example:

- player is currently `fa`
- current canonical file exists as `무소속_eloboard_female_421_matches.json`
- old files such as `뉴캣슬_강덕구_matches.json` or `뉴캣슬_eloboard_female_421_matches.json` should be treated as stale team-context duplicates

## Remove When Stale

### `tmp/exports`

This directory currently has no active code references in the main pipeline.
It looks like a historical export staging area from earlier roster export workflows.

Observed state:

- last updated in March 2026
- includes obsolete team folders such as `nzu`
- not read by current runtime code

Decision:

- safe to delete when cleanup is needed

### `tmp/ppt_review_images`
### `tmp/ppt_review_images_2`

These are unrelated image-review leftovers and are not part of the homepage or pipeline runtime.

Decision:

- safe to delete

### `tmp/gh-actions`
### `tmp/artifacts`
### `tmp/pipeline-reports-*`

These folders are local downloads or unpacked copies of historical GitHub Actions artifacts.
They are useful for one-off forensics, but they are not part of the live pipeline input path.

Decision:

- safe to delete when the investigation is complete
- keep only a fresh run locally when actively analyzing one

### `tmp/gh-run-*`

Treat this like a short-lived local investigation folder.

Decision:

- keep only the current one if it is still being inspected
- delete older ones

### Root-level retired or one-off files

Safe cleanup targets include:

- repro-only export reports such as `*_roster_batch_export_report_repro*.json`
- temporary browser captures like `localhost_*.html`
- scratch script fragments like `run-daily-pipeline.head*.js`
- one-off patch files such as `codex_daily_alert_fix.patch`
- downloaded archives such as `pipeline-reports-*.zip`
- retired team outputs that no longer belong to current project scope, such as `늪지대_*`
- legacy `nzu_*` root artifacts from the old project phase

Decision:

- safe to delete when no active investigation depends on them
- current cleanup script removes these patterns automatically

## Usually Keep Unless You Intend To Archive Less

### `tmp/archive`

This contains archived debug and root artifact files.
It is not part of the live runtime path, but it is intentionally archival rather than accidental clutter.

Decision:

- keep by default
- prune manually only if you no longer need historical debugging material

### `tmp/logs`

Small operational logs live here.

Decision:

- keep unless explicitly rotating logs

## Cleanup Policy

1. Keep `tmp/.cache` and the current `tmp/reports` contract files.
2. Prune old report files inside `tmp/reports` with the existing prune scripts.
3. Delete stale download-like directories under `tmp/` that have no runtime readers.
4. Delete retired-team and repro-only root files when they are clearly outside current project scope.
5. Do not treat old `tmp/reports` comparisons as source truth without checking timestamps first.
