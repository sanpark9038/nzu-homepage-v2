# ACTIVE PLAN: public-page-performance

Created: 2026-05-01
Status: in-progress

## Goal

Make the highest-traffic public pages feel lighter and faster without changing locked labels or weakening SOOP live-state freshness.

## Basis

- User request on 2026-05-01: plan before implementation because the user wants pages to show faster and feel lighter.
- Current `/tier` code calls `playerService.getAllPlayers()` for both full and `liveOnly=true` views.
- `playerService.getAllPlayers()` bypasses the `public-players-list` cache and reads the full `players` list on every `/tier` request.
- `playerService.getLivePlayers()` already queries Supabase with `.eq("is_live", true)` and filters stale live rows after the serving live overlay.
- Existing `scripts/tools/tier-page-cache-contract.test.js` still asserts the older contract that `/tier` must use fresh full-list reads. That test must be rewritten with the new performance intent.
- `/entry`, `/rankings`, `/schedule`, `/api/players`, and `TournamentTeamsView` already use `getCachedPlayersList()`.
- `/prediction` and `/api/prediction` still use `getAllPlayers()` even though they do not need per-request fresh live truth.
- `SidebarNav` fetches all players every minute, but `SHOW_LEFT_SIDEBAR = false` in `app/layout.tsx`, so it is not part of the first user-facing pass.

## Pre-work Confirmation

### Conflict-Risk Files

- `app/tier/page.tsx`
- `lib/player-service.ts`
- `scripts/tools/tier-page-cache-contract.test.js`
- `app/prediction/page.tsx`
- `app/api/prediction/route.ts`
- `components/players/Filters.tsx` only if query behavior changes
- `lib/navigation-config.ts` only if navigation href changes

### Independently Editable Files

- `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`
- new focused contract tests under `scripts/tools/`
- `scripts/tools/tier-page-helpers.test.cjs` if only helper assertions are added

### Last Basis Used

- Code inspection on 2026-05-01 after SOOP Cron was verified healthy.
- `SOOP Cron`: 77/77 success from `2026-05-01T00:00:00+09:00` through `2026-05-01T12:40:00+09:00`, with no gap over 11 minutes.

## Recommended Design

Keep the main navigation `티어표` target as `/tier`, not `/tier?liveOnly=true`.

Reason: changing the default to live-only makes first paint smaller, but it can make the page look empty when no one is live or live sync is temporarily stale. The safer optimization is to make both modes cheaper:

- `/tier`: use the cached public player list.
- `/tier?liveOnly=true`: use a filtered live-player query instead of fetching all players first.
- Keep the existing live toggle as the explicit way to enter live-only mode.

This improves cost and speed without making the default page depend on current broadcaster availability.

## Implementation Targets

### Target 1: Tier Page Data Path

- Add a branch in `app/tier/page.tsx`:
  - if `liveOnly=true`, call `playerService.getLivePlayers()`
  - otherwise call `playerService.getCachedPlayersList()`
- Keep filter behavior unchanged after the player list is loaded.
- Keep `PlayerSearch` names based on the loaded list for the current mode.
- Preserve all existing visible labels.

### Target 2: Tier Contract Tests

- Rewrite `scripts/tools/tier-page-cache-contract.test.js` so it asserts the new intent:
  - `/tier` uses `getCachedPlayersList()`
  - `/tier?liveOnly=true` can use `getLivePlayers()`
  - `/tier` no longer unconditionally calls `getAllPlayers()`
- Keep the existing helper tests for filtering and tier grouping.

### Target 3: Prediction Public Reads

- Change `app/prediction/page.tsx` from `getAllPlayers()` to `getCachedPlayersList()`.
- Change `app/api/prediction/route.ts` GET and POST response rebuilding from `getAllPlayers()` to `getCachedPlayersList()`.
- Reason: prediction match snapshots need team/player metadata, not per-request fresh SOOP live state.

### Target 4: Defer Wider Cleanup

- Do not change navigation labels or public labels.
- Do not switch the navbar `티어표` href to live-only in this pass.
- Do not touch `SidebarNav` unless it becomes visible again.
- Do not refactor player cards or image behavior yet; measure after the data-path change first.

## Verification Plan

- `npm.cmd run test:tier-page-cache-contract`
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:player-live-overlay`
- `npm.cmd run build`
- Browser check:
  - `/tier`
  - `/tier?liveOnly=true`
  - `/prediction`

## Completed Steps

- [x] Confirmed the performance question was about page request cost, not SOOP Cron cost.
- [x] Inspected public page data calls.
- [x] Identified `/tier` and `/prediction` as the first low-risk targets.
- [x] Created this active plan before code edits.
- [x] Updated `scripts/tools/tier-page-cache-contract.test.js` and verified it failed against the old implementation.
- [x] Changed `/tier` so the default page uses `getCachedPlayersList()` and `liveOnly=true` uses `getLivePlayers()`.
- [x] Added `scripts/tools/prediction-cache-contract.test.js`, verified it failed against the old implementation, and wired it into `verify:predeploy`.
- [x] Changed `/prediction` and `GET`/`POST /api/prediction` response rebuilding to use `getCachedPlayersList()`.
- [x] Verified targeted tests and production build.

## Next Steps

- [x] Update the tier cache contract test to fail for the current implementation.
- [x] Update `/tier` data loading to use cached full list or live-only filtered query.
- [x] Run the tier contract and helper tests.
- [x] Update prediction public/API reads to use the cached list.
- [x] Run targeted tests and build.
- [x] Run local route checks for `/tier`, `/tier?liveOnly=true`, and `/prediction`.
- [x] Run lint.
- [x] 2026-05-04 measured deployed `/player`, `/api/players`, `/match`, R2 player-history JSON, and `/api/stats/h2h` after enabling `PLAYER_HISTORY_PUBLIC_BASE_URL`.
- [x] 2026-05-04 changed `/api/stats/h2h` to try ID-based detailed H2H before expanding history-derived name candidates, avoiding duplicate R2 artifact reads for matchups that already resolve by ID.
- [x] 2026-05-04 second pass: investigate deployed `/player` and `/api/stats/h2h` latency after R2 artifact deployment, then change only the smallest confirmed bottleneck.
- [ ] Decide whether to do a second pass on image/card rendering after observing the deployed page.
- [x] Update this plan with verification results.

## Blockers

- none

## Session Recovery

### First Three Commands

```powershell
git status --short --branch
git log --oneline -5
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

### Last Checked State

- Branch: `main`
- Untracked before this plan:
  - `docs/harness/exec-plans/active/2026-05-01-prediction-ux-admin-flow.md`
  - `public/prediction-layout-preview.html`
- Verification on 2026-05-01:
  - `npm.cmd run test:tier-page-cache-contract` passed.
  - `npm.cmd run test:tier-page-helpers` passed.
  - `npm.cmd run test:prediction-cache-contract` passed.
  - `npm.cmd run test:player-live-overlay` passed.
  - `npm.cmd run build` passed.
  - `npm.cmd run lint` passed.
  - Local HTTP checks returned 200 for `/tier`, `/tier?liveOnly=true`, and `/prediction`.

## Files In Play

- `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`
- `app/tier/page.tsx`
- `scripts/tools/tier-page-cache-contract.test.js`
- `app/prediction/page.tsx`
- `app/api/prediction/route.ts`
- `lib/player-service.ts` only if a smaller shared helper becomes necessary

## New Failure Modes Found

- none yet

## 2026-05-04 Player/H2H Performance Notes

- Deployed `GET /api/players` measured warm at about 11-20ms after a 106ms first sample; the player list endpoint is not the current bottleneck.
- Deployed player detail/search route samples were still dynamic and measured about 1.2-1.8s depending on `/player/{uuid}`, canonical slug, or `?query=...`.
- Deployed `GET /api/stats/h2h` measured about 1.5-2.0s for a known matchup and about 2.3-5.5s for a zero-sample matchup.
- Individual R2 player-history JSON files measured about 0.3s warm, so the observed H2H delay is more likely from route-level sequential Supabase/R2/name-fallback work than from a single R2 artifact fetch.
- Verification after the H2H route order change:
  - `node scripts/tools/h2h-route-performance-contract.test.js`
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run build`
- 2026-05-04 cleanup verification after the R2 player-history deployment:
  - `npm.cmd run test:tier-page-cache-contract`
  - `npm.cmd run test:prediction-cache-contract`
  - `npm.cmd run test:tier-page-helpers`
  - `npm.cmd run test:player-live-overlay`
- After deployment `5ccc745`, production smoke checks were 200 for `/tier`, `/tier?liveOnly=true`, and `/prediction`.
- After the R2 player-history artifact code deployed, heavy player detail routes still measured in the 2-4s range and known H2H samples in the 1.6-3.4s range. The next pass should gather route-level evidence before changing code.

## 2026-05-04 Player/H2H Second Pass

### Scope

- Keep visible labels unchanged.
- Do not change roster, rankings, or prediction behavior.
- Prefer one targeted serving-path change with a contract test.

### Investigation Questions

- Does `/player` spend time on data fetching, RSC rendering payload size, or client component hydration/payload size?
- Does `/api/stats/h2h` still perform avoidable fallback work after the ID-based route change?
- Can full player history reads be bounded or deferred without losing all-time stats/H2H correctness?

### Verification Targets

- Focused contract test for the confirmed bottleneck.
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- Production smoke check for the changed route after deployment.

### Implemented Player-Page Fix

- Bounded `recentLogs` passed to the client detail card to 25 rows while keeping full history available for server-side summary calculations.
- Reused the player row fetched during canonical `/player/[id]` redirect checks when rendering `PlayerPageView`.
- Changed ID-prefix lookup to reuse `getCachedPlayersList()` instead of issuing a fresh full Supabase player-list query.

### Implemented H2H Second-Pass Fix

- Changed ID-based `/api/stats/h2h` requests to return `getDetailedH2HStats(p1_id, p2_id)` directly, including zero-sample results, instead of expanding name candidates afterward.
- Kept name-based `getInstantH2H` fallback for requests that do not include both player IDs.
- Changed detailed H2H artifact loading to read P1 history first and read P2 history only as a reciprocal fallback when P1 has no matching entries.
- Added a 300 second `unstable_cache` wrapper for ID-based detailed H2H stats, tagged with `public-player-history`, so repeated matchup checks avoid redoing the Supabase/R2 path.
- Changed the shared client matchup helper so `fetchH2HStats()` makes one API request when both player IDs are present, leaving name-candidate fallback only for non-ID requests.
- Changed the client H2H request caches to keep successful zero-sample payloads, while still evicting null payloads and rejected requests so transient failures can retry.
- Restored `test:matchup-helpers` by loading the production TypeScript helper through a small test-only transpile loader that resolves the repo's extensionless imports like the app bundler does.

### Verification

- `npm.cmd run test:player-page-payload-contract`
- `npm.cmd run test:h2h-route-performance-contract`
- `npm.cmd run test:matchup-h2h-fetch-contract`
- `npm.cmd run test:matchup-zero-h2h-cache-contract`
- `npm.cmd run test:matchup-helpers`
- `npm.cmd run test:player-live-overlay`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- Production browser verification after deploy:
  - `/entry`: selected `김윤중` vs `이영한`; one `/api/stats/h2h` request was recorded and the detailed report rendered.
  - `/match`: selected `김윤중` as A-team and `이영한` as B-team; one `/api/stats/h2h` request was recorded and `기세 분석` became enabled.
  - `/tier`: quick-added `김지성` and `김명운`; one `/api/stats/h2h` request was recorded and the H2H selector rendered.
  - `agent-browser.cmd errors` returned no console errors.
