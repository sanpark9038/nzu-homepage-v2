# Metadata DB

This directory is the reusable metadata layer for NZU and future projects.

The intended separation is:

- `players.master.v1.json`
  - Cross-project canonical player identity DB.
  - Stable primary key: `entity_id`
  - Identity contract: `eloboard:{gender}:{wr_id}` or `eloboard:{gender}:mix:{wr_id}`
  - Use this when a new project needs a shared player identity source.

- `projects/<code>/players.<code>.v1.json`
  - Project/team-specific roster view.
  - References canonical `entity_id` from the master DB.
  - Adds roster semantics such as `team_code`, `tier`, `race`, `display_name`, freshness fields, and profile URL.
  - Use this when a project needs a current roster snapshot rather than the full identity DB.

- Supabase `players`
  - Serving layer for the current NZU website.
  - This is not the canonical source of identity.
  - Website projects may consume it directly, but upstream logic should still treat local metadata as the source of truth.

## Consumer Contract

If another homepage or app wants to reuse this pipeline output:

1. Read `players.master.v1.json` for stable identity.
2. Read `projects/*/players.*.v1.json` for current roster membership.
3. Treat `entity_id` as the durable join key across projects.
4. Do not assume Supabase is the only serving layer.
5. Validate both master and project roster metadata before publishing or syncing.

Hard contract for `projects/*/players.*.v1.json`:

- `team_code` must remain stable and match the dataset folder.
- `entity_id` is the durable player join key.
- `name`, `tier`, `race`, `source`, `missing_in_master` are required roster semantics.

Recommended fields for richer consumers:

- `display_name`
- `profile_url`
- `profile_kind`
- freshness fields such as `last_checked_at`, `last_match_at`, `last_changed_at`

## Build

```bash
node scripts/tools/build-metadata-db.js
```

or

```bash
npm run build:metadata
```

Build outputs:

- `data/metadata/players.master.v1.json`
- `data/metadata/projects/nzu/players.nzu.v1.json`
- `tmp/metadata_db_build_report.json`

## Source of Input

- `scripts/player_metadata.json`

The build step normalizes source rows into a reusable schema and emits a report for conflicts and data quality checks.

## Schema

- `schema/players.master.v1.schema.json`
- `schema/tags.v1.md`

Validate generated metadata:

```bash
npm run validate:metadata
npm run validate:metadata:projects
```

## Pipeline Alert Rules

- `pipeline_alert_rules.v1.json`
  - Controls daily pipeline alert severities, allowlists, and blocking behavior.
  - `zero_record_players_severity` is intentionally treated as a blocking-level alert (`high`) unless explicitly redesigned.

Validate alert rules:

```bash
npm run validate:pipeline-alert-rules
```
