# Site Smoke Test Checklist

This checklist is for validating the chain:

`pipeline -> Supabase serving layer -> homepage`

## Current Serving Reality

As of 2026-04-01:

- `players`: synced and verified
- `matches`: currently empty
- `eloboard_matches`: currently empty

That means:

- player-driven pages can be validated now
- match-history-driven pages are not ready for full acceptance yet

## Phase 1: Ready Now

These checks should pass before calling the current homepage integration stable.

### Current Page Scope

Pages currently in active phase-1 integration:

- `/tier`
- `/player`
- `/player/[id]`

Pages currently deferred:

- `/`
- `/match`
- `/entry`
- `/battle-grid`
- `/live`

Reason for deferral:

- the page design is still open, or
- the page depends on match-driven serving data that is not ready yet

### Pipeline / Sync

- Latest GitHub Actions run is `success`
- Manual sync run reports `with_supabase_sync: true`
- `supabase_push` step is `ok`
- Discord summary is `success`

### Supabase Serving Layer

- `players` row count is non-zero and matches the latest sync expectation
- recently changed players show fresh `last_changed_at`
- sample player renders non-empty:
  - `name`
  - `tier`
  - `race`
  - `university`
  - `last_changed_at`

### Homepage Pages To Validate First

- `/player`
- `/player/[id]`
- `/tier`
- `/live`

### Recommended Sample Player Rule

Choose a player from `players` with:

- recent `last_changed_at`
- non-empty `name`
- non-empty `tier`
- non-empty `race`
- stable university value

Do not require match history for the first smoke pass.

## Phase 2: Not Ready Yet

These pages depend on serving data that is not fully synced yet.

- `/match`
- `/battle-grid`
- player detail sections that assume real match history

## Phase 2 Exit Criteria

Before accepting match-driven pages:

- `matches` row count is non-zero
- `eloboard_matches` row count is non-zero or intentionally deprecated
- sample player has actual recent match rows
- homepage match/history sections render real data instead of empty state only

## Immediate Decision Needed

There are now two valid next directions:

1. launch homepage phase 1 using player-centric pages first
2. extend the pipeline serving sync to populate `matches` and `eloboard_matches` before broader homepage acceptance
