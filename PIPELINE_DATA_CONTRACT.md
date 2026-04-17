# Pipeline Data Contract

This document defines how the current project should consume pipeline output.

## Serving Rule

Public website pages must read from Supabase.

- `players`
- `matches`
- `eloboard_matches`

Do not add runtime scraping into page rendering.

## Source-of-Truth Rule

Pipeline and metadata logic live in local files.

- identity source: `data/metadata/players.master.v1.json`
- roster source: `data/metadata/projects/*/players.*.v1.json`
- pipeline state / reports: `tmp/reports/`

Supabase is the serving layer, not the canonical identity layer.

## Actual Pipeline Flow

The current pipeline moves through four layers:

1. Source collection
   - team roster discovery and roster sync update `data/metadata/projects/*/players.*.v1.json`
   - match collection produces chunked reports and warehouse-style intermediates under `tmp/` and `tmp/reports/`
2. Local canonicalization
   - shared identity stays in `data/metadata/players.master.v1.json`
   - project roster views stay in `data/metadata/projects/*/players.*.v1.json`
   - operational checks and alert rules evaluate freshness, roster transitions, and data anomalies
3. Serving sync
   - approved sync reads staging data and writes serving tables in Supabase
   - current serving tables are `players`, `matches`, and `eloboard_matches`
4. Consumer read layer
   - public pages read serving data through `lib/player-service.ts`
   - admin / ops surfaces may read local reports and metadata directly

In code, the main execution path is:

1. `scripts/tools/run-manual-refresh.js`
2. `scripts/tools/run-ops-pipeline-chunked.js`
3. `scripts/tools/run-ops-pipeline.js`
4. `scripts/tools/run-daily-pipeline.js`
5. `scripts/tools/merge-chunked-daily-reports.js`
6. `scripts/tools/push-supabase-approved.js`

The main handoff artifacts between those steps are:

- `tmp/reports/manual_refresh_baseline.json`
- `tmp/reports/team_roster_sync_report.json`
- `tmp/reports/team_auto_discovery_report.json`
- `tmp/reports/daily_pipeline_snapshot_*.json`
- `tmp/reports/daily_pipeline_alerts_*.json`
- `tmp/reports/daily_pipeline_snapshot_latest.json`
- `tmp/reports/daily_pipeline_alerts_latest.json`
- `tmp/reports/pipeline_collection_sources_health_latest.json`

For a stable machine-readable index of the current handoff points, see:

- `data/metadata/pipeline_outputs.manifest.v1.json`
- `data/metadata/pipeline_script_inventory.v1.json`
- `data/metadata/pipeline_runtime_flow.v1.json`

## Intended Consumer Split

### Public site

Use Supabase only.

- player lists
- player detail
- tier pages
- live pages
- battle / h2h pages

### Admin / ops surfaces

May reference local metadata or pipeline reports when operational context is required.

- roster editor
- pipeline rules
- data lab
- pipeline status / report review

## Stable Join Key

Across current and future projects, the durable player identity key is:

- `entity_id` in metadata
- `eloboard_id` in Supabase serving tables

When building a new project on top of this pipeline, assume:

1. `players.master.v1.json` is the shared identity DB.
2. `projects/*/players.*.v1.json` is the per-project roster view.
3. Supabase `players` is a delivery surface for websites, not the source of identity truth.

## Required Metadata Contracts

### Hard contract for project roster metadata

- `team_code` matches the project folder
- `entity_id` is present and stable
- `name` is present
- `tier` is present
- `race` is present
- `source` is present
- `missing_in_master` is present

### Recommended fields for richer consumers

- `display_name`
- `profile_url`
- `profile_kind`
- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

## Reuse Assessment

Another project can integrate with this pipeline most easily at the metadata or serving layer.

### Reusable as-is

- `data/metadata/players.master.v1.json`
- `data/metadata/projects/*/players.*.v1.json`
- `entity_id` as the durable join key
- `tmp/reports/daily_pipeline_snapshot_latest.json`
- `tmp/reports/daily_pipeline_alerts_latest.json`
- alert rule configuration in `data/metadata/pipeline_alert_rules.v1.json`

These are already structured like reusable contracts rather than page-specific implementation details.

### Reusable with light adaptation

- Supabase serving tables if the next project accepts the same table names and fields
- `lib/player-service.ts` patterns if the next site also uses Next.js + Supabase
- pipeline status / Discord summary checks if the next project keeps the same report file layout

### Coupled to the current project

- source scraping assumptions around Eloboard university/team pages
- auto team discovery against `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list`
- SOOP-specific enrichment and identity overlays
- Supabase sync implementation that expects `players_staging` and writes to `players`
- HOSAGA-specific branding, site copy, and page composition

So the current answer is:

- the data contracts are reasonably portable
- the collection and serving implementation is only partially portable
- another project should plug into the metadata or serving outputs, not copy the scraper stack blindly

## Recommended Integration Strategy For Another Project

If a new project wants to reuse this pipeline with the least friction:

1. Reuse `players.master.v1.json` and project roster files as the upstream contract.
2. Keep `entity_id` as the stable cross-project join key.
3. Decide whether the new consumer wants:
   - direct metadata consumption, or
   - Supabase serving tables
4. If using a different serving backend, replace only the sync layer.
5. If using different live/broadcast providers, replace SOOP-specific enrichment without changing identity or roster contracts.
6. If using different source sites, replace collection/discovery scripts but keep output contracts stable.

## Homepage Integration Order

1. Keep Supabase schema and `lib/database.types.ts` aligned.
2. Keep `lib/player-service.ts` as the main read layer for website player pages.
3. Use local metadata only for admin / ops use cases unless there is a strong reason otherwise.
4. Before attaching a new homepage to this pipeline, validate:
   - `npm run validate:metadata`
   - `npm run validate:metadata:projects`
   - pipeline freshness
   - one successful serving-layer sync
