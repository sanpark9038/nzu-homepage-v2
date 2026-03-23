# Main AI Handoff: Homepage <> Supabase <> Metadata Integration

Date: 2026-03-23
Project root: `C:\Users\NZU\Desktop\nzu-homepage`
Audience: main AI agent with slightly lower capability than Codex, expected to continue implementation safely.

## 1. Objective

Connect the homepage to the current pipeline output and Supabase state in a way that is operationally correct.

The intended data model is:

- pipeline and local metadata are the source of truth for collection logic and player metadata evolution
- Supabase `players` is the serving layer for the website
- the website should render from Supabase, not scrape at runtime

This handoff is specifically about:

1. ensuring the homepage reads the right Supabase fields
2. ensuring local metadata semantics match the website’s display logic
3. identifying schema / typing mismatches that must be corrected before deeper UI integration

## 2. Current Verified State

### Pipeline / GitHub Actions

- GitHub Actions manual and scheduled runs are succeeding
- cache-backed incremental execution is working
- Discord notifications are sending
- no-change Discord flow has been validated in real runs
- player-change Discord sections are implemented but still need a real change event for live verification

### Supabase

Previously verified live DB state:

- `players_staging`: `293`
- `players`: `293`
- exclusions applied correctly
- sample player checks were correct

### Current architectural direction

The website should behave like a read-only consumer of stored data.

Do not design new runtime scraping paths into page rendering.

## 3. Files That Matter Most

### Supabase client and typing

- [lib/supabase.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/supabase.ts)
- [lib/database.types.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/database.types.ts)
- [types/index.ts](C:/Users/NZU/Desktop/nzu-homepage/types/index.ts)

### Website data access layer

- [lib/player-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/player-service.ts)
- [lib/h2h-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/h2h-service.ts)

### Main pages currently consuming player data

- [app/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/page.tsx)
- [app/players/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/players/page.tsx)
- [app/tier/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/tier/page.tsx)
- [app/entry/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/entry/page.tsx)
- [app/battle-grid/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/battle-grid/page.tsx)

### UI components most affected by field mapping

- [components/players/PlayerCard.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/players/PlayerCard.tsx)
- [components/players/PlayerRow.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/players/PlayerRow.tsx)
- [components/ui/nzu-badges.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/ui/nzu-badges.tsx)
- [components/stats/H2HLookup.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/stats/H2HLookup.tsx)
- [components/battle-grid/BattleGrid.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/battle-grid/BattleGrid.tsx)

### Pipeline / metadata files to understand data semantics

- [PIPELINE_EXTERNAL_BRIEF.md](C:/Users/NZU/Desktop/nzu-homepage/PIPELINE_EXTERNAL_BRIEF.md)
- [PIPELINE_ONE_PAGE.md](C:/Users/NZU/Desktop/nzu-homepage/PIPELINE_ONE_PAGE.md)
- [scripts/tools/supabase-staging-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-staging-sync.js)
- [scripts/tools/supabase-prod-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js)
- [scripts/tools/send-manual-refresh-discord.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.js)

## 4. Important Data Reality

The current pipeline syncs these fields into Supabase `players`:

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
- `is_live`

This matters because the website type definitions do **not** fully reflect that current schema yet.

## 5. Critical Problem: Type Definitions Are Behind The Real DB

[lib/database.types.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/database.types.ts) currently defines `players.Row` without the newer pipeline fields:

- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

But the pipeline sync scripts clearly use them:

- [scripts/tools/supabase-staging-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-staging-sync.js)
- [scripts/tools/supabase-prod-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js)

### Required action

The main AI should update the typed DB contract before relying on those fields in the UI.

If not fixed first, the UI layer may:

- ignore useful freshness/priority metadata
- use unsafe casts
- drift into runtime confusion where fields exist in Supabase but are absent from TypeScript

## 6. Current Homepage Data Flow

Current website reading behavior is already broadly correct:

- [lib/player-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/player-service.ts) reads from Supabase `players`
- pages such as [app/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/page.tsx) and [app/players/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/players/page.tsx) consume `playerService`

That means the core integration direction is not to invent a new data source.

The correct next step is:

- refine field usage and presentation based on the enriched pipeline metadata already present in Supabase

## 7. Recommended Work Order For Main AI

### Step 1: Update DB typings

Extend [lib/database.types.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/database.types.ts) so `players` includes the pipeline freshness / priority fields already being synced.

At minimum add:

- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

### Step 2: Audit all `players` consumers

Review:

- [lib/player-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/player-service.ts)
- [app/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/page.tsx)
- [app/players/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/players/page.tsx)
- [app/tier/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/tier/page.tsx)
- [app/entry/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/entry/page.tsx)
- [app/battle-grid/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/battle-grid/page.tsx)

The task is to confirm:

- no page is still conceptually relying on stale assumptions from old schema
- no page expects fields that the pipeline no longer owns
- sorting and display logic still match current tier/university/race semantics

### Step 3: Introduce useful metadata into the homepage where it adds product value

Likely low-risk improvements:

- show freshness indicators using `last_match_at` or `last_checked_at`
- expose `check_priority` in admin/ops-oriented views, not necessarily public player cards
- use `last_changed_at` for “recently changed” or “recently updated” admin visibility

Do **not** overload the public-facing UI with raw ops metadata unless the product benefit is clear.

### Step 4: Keep Supabase as the serving source

If the main AI is tempted to read local JSON directly in the main public pages, avoid that unless there is a narrow admin-only reason.

Public site rule:

- serve from Supabase

Local metadata rule:

- use as pipeline logic and admin reference

### Step 5: Verify tier semantics carefully

The UI currently contains mixed assumptions around tier representation.

Examples:

- [components/ui/nzu-badges.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/ui/nzu-badges.tsx)
- [app/tier/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/tier/page.tsx)
- [components/battle-grid/TierRow.tsx](C:/Users/NZU/Desktop/nzu-homepage/components/battle-grid/TierRow.tsx)

Potential risk:

- some code appears to expect English symbolic tiers like `god`, `king`, `jack`
- pipeline and metadata often carry Korean strings like `갓`, `킹`, `잭`, `조커`, `스페이드`, and numbered tiers

Main AI should normalize this carefully instead of patching per-screen ad hoc.

Recommended direction:

- define one central mapping between DB tier values and display / ordering logic
- use that mapping consistently across cards, tier pages, and battle-grid

## 8. Field Mapping Guidance

### What the website should primarily display from Supabase

- `name`
- `photo_url`
- `race`
- `tier`
- `university`
- `gender`
- `is_live`

### What should be considered support metadata

- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`
- `eloboard_id`

### What should remain admin / debug oriented unless clearly needed

- direct pipeline artifact semantics
- local baseline comparison files
- raw `tmp/reports/*` internals

## 9. Things The Main AI Should Not Break

- Do not replace Supabase reads with direct local JSON reads for the public site
- Do not assume `database.types.ts` is already current
- Do not assume tier strings are fully normalized across all UI surfaces
- Do not remove the current pipeline-driven field set from sync scripts without understanding downstream usage
- Do not treat Discord alert logic as the website serving layer; it is operational reporting only

## 10. Good First Deliverable

The best first concrete deliverable from the main AI would be:

1. update `database.types.ts`
2. update any derived `Player` typing consumers automatically through existing imports
3. add a minimal, coherent use of freshness metadata in an admin or player detail surface
4. verify the homepage still renders correctly
5. document the final field mapping in one short code comment block or small internal doc

## 11. Optional High-Value Follow-Up

If there is time after the basic integration:

- add a “recently updated players” admin panel using `last_changed_at`
- add “data freshness” badges using `last_match_at`
- align tier normalization across:
  - player list
  - tier page
  - battle grid
  - h2h lookup

## 12. Bottom-Line Instruction To Main AI

You are not being asked to redesign the pipeline.

You are being asked to:

- trust Supabase as the serving data source
- make the homepage correctly consume the richer metadata already produced by the pipeline
- fix typing drift first
- then improve display and integration carefully

