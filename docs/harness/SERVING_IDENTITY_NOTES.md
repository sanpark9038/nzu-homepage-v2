# Serving Identity Notes

This note keeps the next serving-sync identity change grounded in repo-visible rules.

Do not flip `onConflict: 'name'` or stale delete logic to a new key until this note stays true.

## Confirmed Current Contract

- canonical shared identity lives in metadata as `entity_id`
- serving tables store that identity in `players.eloboard_id`
- public pages should read serving data from Supabase, not local metadata

See:

- [../../PIPELINE_DATA_CONTRACT.md](../../PIPELINE_DATA_CONTRACT.md)
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

## Current Reality In Code

These paths are still name-keyed today:

- staging upsert writes to `players_staging` with `onConflict: 'name'`
- production upsert writes to `players` with `onConflict: 'name'`
- stale production delete still deletes by `name`
- history opponent identification is still name-based

Player-side serving stats seeding is now more durable than before:

- `supabase-prod-sync.js` prefers `player_entity_id` / `buildSyncIdentityKey(...)` for player-side stats lookup
- stable CSV fallback still works from `wr_id/gender/mix` file naming

The remaining name-heavy area is mainly inside history opponent fields and any fallback alias paths.

The repo now has fail-closed guards for harmful same-name different-identity collisions,
but the write-path contract itself is still name-based.

## Canonical Serving Identity Rule

Until a better repo-visible contract exists, treat the serving identity bucket as:

1. `gender + wr_id` when both are available
2. full `eloboard_id` when `wr_id` is missing
3. never `name` as the intended long-term write key

This matches the current sync safety helpers in `supabase-staging-sync.js` and
`supabase-prod-sync.js`.

This is narrower than the metadata-side uniqueness rule, which can still keep
`profile_kind` or full `entity_id` variants distinct upstream.

## Mix Variant Collapse Rule

For serving-sync purposes, `male:913` and `male:mix:913` style variants should collapse
into the same identity bucket when they share the same `gender` and `wr_id`.

That collapse rule is currently allowed in safety checks because those rows represent the
same underlying player identity with different upstream entity variants.

In other words:

- metadata may still preserve mix and non-mix variants separately
- serving sync currently treats them as one durable player bucket when `gender` and `wr_id` match

Do not assume the same collapse is safe across different genders or different `wr_id`s.

## What Is Still Missing

The repo does not currently provide repo-visible proof of all schema requirements needed
for a safe identifier-based write path.

Missing or still implicit:

- typed `players_staging` schema in `lib/database.types.ts`
- repo-visible DDL for the full `players_staging` table
- repo-visible proof of a unique constraint or index for the canonical serving identity
- an identifier-based serving-stats join contract for `fact_matches.csv` and stable CSVs
- an identifier-based stale-delete contract

Opponent durable identity is now treated as an optional contract extension:

- `match_history` / H2H may consume `opponent_entity_id` or an equivalent durable opponent identity when present
- until that field is populated consistently, opponent matching remains fail-closed and name-based fallback is still expected

A draft migration now exists at:

- [../../scripts/sql/add-serving-identity-key.sql](../../scripts/sql/add-serving-identity-key.sql)
- [../../scripts/sql/check-serving-identity-schema.sql](../../scripts/sql/check-serving-identity-schema.sql)

Treat it as a proposal, not confirmed live schema.

## Required Before Any `onConflict` Flip

Before changing staging or production sync away from `name`, make sure all of these are
true in the repo:

1. `players_staging` has a repo-visible schema note or typed contract
2. the canonical serving identity key is named explicitly in docs
3. a matching unique constraint or index exists, or a migration is defined
4. stale delete uses the same durable key as the upsert path
5. serving stats and history joins are no longer silently name-only

If any item above is still unclear, keep the current fail-closed guards and do not claim
that the sync path is identifier-based yet.

## Live-Schema Verification

Before applying the draft migration or switching sync writes, run:

- [../../scripts/sql/check-serving-identity-schema.sql](../../scripts/sql/check-serving-identity-schema.sql)

That query set is the read-only check for:

- current table shape
- existing constraints and indexes
- duplicate candidate `serving_identity_key` rows
- missing `eloboard_id` coverage

## Operator Check

Use this as the pass/fail guide after running the read-only SQL.

### Pass

All of these should be true before any identifier-based upsert/delete change:

1. `players` and `players_staging` can both hold the canonical serving key without schema surprises
2. the duplicate candidate `serving_identity_key` query returns zero rows for both tables
3. the live schema already has a matching unique/index contract, or the migration path is explicitly approved
4. `eloboard_id` coverage is high enough that the durable key can be computed for every write-path row
5. stale delete can move to the same durable key instead of staying on `name`

### Fail

Do not flip `onConflict: 'name'` yet if any of these appear:

- duplicate candidate `serving_identity_key` rows
- no unique/index contract for the durable serving key
- unexpected live schema mismatch against the draft migration assumptions
- rows that still cannot compute a durable upstream identity
- a plan to change upsert only while leaving stale delete on `name`

### Caveats

Even a pass on the live schema check does not finish the whole transition.

These are still separate risks:

- history opponent fields and some fallback joins are still name-based today
- metadata may preserve `profile_kind` distinctions that serving currently collapses
- the check SQL does not compare staging and production buckets across tables

## Implementation Order After Pass

If the live schema check passes, do not flip everything at once.

Use this order:

1. confirm or apply the canonical serving-key schema change
2. update staging sync to write and verify the durable serving key
3. update production stale delete to use the same durable key
4. only then consider moving production upsert away from `name`
5. after write-path changes are stable, replace name-based serving stats/history joins

This order exists because changing `onConflict` alone is not enough.

If serving stats/history still join by `name`, the site can still attach the wrong
record even after the write key changes.
