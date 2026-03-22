# NZU Data Pipeline Brief

## Purpose
- Collect accurate player metadata and match records from ELOBoard-derived sources.
- Keep the website fast by serving stored data from Supabase instead of scraping at request time.
- Allow manual refresh when the operator turns on the PC and runs a command.
- Automatic scheduled execution is optional and not required for current operation.

## Current Operating Model
- Data refresh is manual.
- The operator runs one command on the local PC.
- The pipeline collects updates, validates them, updates local metadata, and pushes the approved result to Supabase.
- The website reads from Supabase only.

## Primary Command Set
1. Refresh data:
```bash
npm run pipeline:manual:refresh
```

2. Check latest status:
```bash
npm run pipeline:status
```

## What `pipeline:manual:refresh` Does
`pipeline:manual:refresh` runs [scripts/tools/run-manual-refresh.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js).

That script runs these two steps in sequence:

1. Chunked collection:
```bash
node scripts/tools/run-ops-pipeline-chunked.js --chunk-size 3 --inactive-skip-days 14
```

2. Approved Supabase push:
```bash
node scripts/tools/push-supabase-approved.js --approved
```

## Collection Pipeline Flow
The chunked collector is [scripts/tools/run-ops-pipeline-chunked.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline-chunked.js).

Its flow is:

1. Run roster sync once:
```bash
node scripts/tools/sync-team-roster-metadata.js
```

2. Run display alias normalization once per team:
```bash
node scripts/tools/apply-player-display-aliases.js --project <team>
```

3. Split teams into chunks of 3.

4. For each chunk, call:
```bash
node scripts/tools/run-ops-pipeline.js --skip-supabase --no-discord --teams <chunk teams> --date-tag <run_tag> --no-roster-sync --no-display-alias --no-team-table --no-organize --inactive-skip-days 14
```

5. Merge chunk outputs into one daily snapshot:
```bash
node scripts/tools/merge-chunked-daily-reports.js --output-date <YYYY-MM-DD> --chunk-date-tags <chunk tags>
```

6. Update player check-priority metadata:
```bash
node scripts/tools/update-player-check-priority.js --teams <all teams>
```

7. Push local results to Supabase staging and then production:
```bash
node scripts/tools/supabase-staging-sync.js
node scripts/tools/supabase-prod-sync.js
```

## Incremental Collection Strategy
The pipeline is not designed to fully rebuild every player every time.

It uses incremental collection based on player-level metadata:
- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

Current priority rules:
- Recent match within 14 days: `high`, check every 1 day
- Last match 15-45 days ago: `normal`, check every 3 days
- Last match 46+ days ago: `low`, check every 7 days

If a player is still inside the priority window and previous exported JSON exists, the pipeline reuses the existing record instead of refetching it.

## Identity / Collision Handling
The pipeline does not rely on raw `wr_id` alone.

It uses `entity_id` as the primary identity key.

This is important because identical numeric IDs can refer to different people depending on source section:
- female player page
- male player page within the women site
- male site player page

Therefore exclusions and lookups follow:
1. `entity_id` exact match first
2. fallback to `wr_id + name` only when needed

This prevents false exclusions such as players sharing the same numeric ID across different source namespaces.

## Data Sources and Storage
### Local metadata
- Player metadata:
  - `data/metadata/projects/*/players.*.v1.json`

### Local exported match artifacts
- Detailed match JSON:
  - `tmp/exports/*/json/*_matches.json`
- Detailed match CSV:
  - `tmp/exports/*/csv/*_상세전적*.csv`

### Local reports
- Daily snapshots and alerts:
  - `tmp/reports/*`

### Remote storage
- Supabase `players_staging`
- Supabase `players`

## Supabase Fields Currently Synced
Each player sync includes:
- `eloboard_id`
- `name`
- `tier`
- `race`
- `university`
- `gender`
- `photo_url`
- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

## Website Behavior
The website is expected to:
- read from Supabase only
- avoid runtime scraping
- render player and match data from stored records

This keeps the site light and fast even if collection takes minutes or tens of minutes offline.

## Current Strengths
- Identity collision handling is already implemented.
- Incremental refresh exists.
- Detailed match metadata is already accumulated locally.
- Supabase sync path is operational.
- Manual refresh mode is validated.
- The website can stay fast because it only consumes stored data.

## Current Limitations
- The refresh process still runs on the local PC.
- If the PC is off, manual refresh cannot run.
- Current operation prioritizes accuracy over minimal runtime.
- `pipeline:status` is mainly an operational summary, not a full player-by-player diff report.

## Latest Validation Summary
Latest validated manual refresh completed successfully and produced:
- chunked collection report
- merged daily snapshot
- zero alerts for critical/high/medium/low in that run
- successful Supabase staging and production sync

This means:
- the command chain works
- Supabase receives refreshed data
- the deployed website can show new data after a manual refresh, as long as it reads from Supabase

## Recommended Interpretation
This system should be understood as:
- a local manual ETL pipeline
- feeding Supabase as the serving database
- with the website acting as a read-only consumer of the stored dataset

It is not currently a real-time scraper and not currently a cloud-executed batch system.
