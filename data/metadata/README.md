# Metadata DB

This directory is the reusable player identity metadata DB for cross-project use.

## Files

- `players.master.v1.json`
  - Canonical player identity records.
  - Primary key: `entity_id` (`eloboard:{gender}:{wr_id}` or `eloboard:{gender}:mix:{wr_id}`).
  - Uniqueness model: `wr_id + gender + profile_kind`.

- `projects/nzu/players.nzu.v1.json`
  - Project-specific roster view for NZU.
  - References canonical `entity_id` from the master DB.

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
```

## Pipeline Alert Rules

- `pipeline_alert_rules.v1.json`
  - Controls daily pipeline alert severities, allowlists, and blocking behavior.
  - `zero_record_players_severity` is intentionally treated as a blocking-level alert (`high`) unless explicitly redesigned.

Validate alert rules:

```bash
npm run validate:pipeline-alert-rules
```
