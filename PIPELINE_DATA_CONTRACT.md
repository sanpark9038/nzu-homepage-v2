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

## Homepage Integration Order

1. Keep Supabase schema and `lib/database.types.ts` aligned.
2. Keep `lib/player-service.ts` as the main read layer for website player pages.
3. Use local metadata only for admin / ops use cases unless there is a strong reason otherwise.
4. Before attaching a new homepage to this pipeline, validate:
   - `npm run validate:metadata`
   - `npm run validate:metadata:projects`
   - pipeline freshness
   - one successful serving-layer sync
