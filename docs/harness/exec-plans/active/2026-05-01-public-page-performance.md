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
- [x] Decide whether to do a second pass on image/card rendering after observing the deployed page.
- [x] 2026-05-04 deferred heavy player detail-summary work for collapsed exact-search results.
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

- FM-008: stale player-history R2 artifact can override fresher Supabase embedded match history.

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
- Added a 300 second `unstable_cache` wrapper around public player-history artifact reads, tagged with `public-player-history`, after production samples showed player detail routes still spent time repeatedly loading the same R2 history JSON.
- Added `lib/player-detail-summary.ts` as the shared detail-summary builder.
- Changed collapsed exact-search cards to render without preloading full `getPlayerMatches()` work.
- Added `GET /api/player-detail-summary?id=...` so the expanded detail report can fetch cached full-history summaries on demand.
- Kept explicit player detail routes preloaded because those routes open the detail report by default.

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
- `npm.cmd run test:player-history-artifact-cache-contract`
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
- Local browser verification after deferred player detail-summary change:
  - `http://localhost:3000/player?query=김지성` rendered the collapsed exact player card.
  - Before clicking the detail button, Performance Resource Timing showed 0 `/api/player-detail-summary` requests.
  - After clicking the detail button, one `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49` request was recorded and the expanded section rendered.
  - `agent-browser.cmd errors` returned no console errors.

## 2026-05-04 Production Player Residual Measurement

### Scope

- Latest production deployment measured: `dpl_9ofbEdXTDqM8Tm2UVNCFpBNLp3ck`.
- Production domain measured: `https://nzu-homepage-v2.vercel.app`.
- Goal: separate remaining player-search/detail latency from H2H cache behavior and client/card rendering.

### Route Samples

- `GET /api/players`: 5 samples at about 40-312ms total; headers later showed `X-Vercel-Cache: HIT` and `Age: 75`.
- `GET /player`: first sample about 1.24s, then about 244-281ms warm.
- `GET /player?query=김지성`: 5 samples about 2.19-4.16s total.
- `GET /player?query=김`: 5 samples about 0.80-0.84s total.
- `GET /player/5aee11bf-9641-4056-8290-8c4cae1efa49`: 5 samples about 1.43-2.14s total.
- `GET /player/66a8e705-a145-47fb-ac17-015e03a4567b`: 5 samples about 1.09-2.09s total.
- `GET /api/stats/h2h` with both IDs: first sample about 2.49s, then about 239-257ms. This confirms the ID-based H2H `unstable_cache` is working for repeated checks.

### Header And Browser Evidence

- `/player?query=김지성` and `/player/{id}` returned `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, `X-Vercel-Cache: MISS`.
- `x-vercel-id` showed `icn1::iad1`, so requests entered through ICN and executed in IAD for the serverless leg.
- Browser navigation timing for `/player/5aee11bf-9641-4056-8290-8c4cae1efa49`:
  - `responseEnd` about 1868ms, `DOMContentLoaded` about 2126ms, `load` about 2529ms.
  - Console errors: none.
- Browser navigation timing for `/player?query=김지성`:
  - `responseEnd` about 2776ms, `DOMContentLoaded` about 2812ms, `load` about 2813ms.
  - Static chunks were already cached in the browser, so the wait was dominated by the initial server response.
- Snapshot showed `/player?query=김지성` renders an exact player card in collapsed state with `상세 리포트` available, but server code still computes match summaries before rendering that collapsed state.

### Data Source Timing

- Direct read for 김지성 (`5aee11bf-9641-4056-8290-8c4cae1efa49`):
  - Supabase player detail row: about 583ms.
  - `matches` join query with limit 1869: about 76ms, 0 rows.
  - Supabase player history row: about 123ms, 1869 embedded rows.
  - R2 history artifact fetch: about 976ms, 411811 bytes.
- Direct read for 김윤중 (`66a8e705-a145-47fb-ac17-015e03a4567b`):
  - Supabase player detail row: about 634ms.
  - `matches` join query with limit 506: about 94ms, 0 rows.
  - Supabase player history row: about 112ms, 506 embedded rows.
  - R2 history artifact fetch: about 447ms, 117824 bytes.

### Conclusion

- The remaining visible player-page latency is not primarily from client card rendering or image loading.
- `/api/players` is already cheap and cacheable.
- H2H repeated ID lookups are now fast after the first request.
- The main remaining player bottleneck is the dynamic server response for exact player search/detail:
  - `PlayerPageView` calls `noStore()`.
  - Exact player search computes detail summaries even when the result card is initially collapsed.
  - Player detail currently loads full history because `matchLimit` is derived from total wins plus losses.
  - Heavy-history players pay this cost before first paint.

### Next Candidate Fix

- Split the player result card into a fast collapsed summary path and a deferred detail-summary path.
- Keep the current visible labels unchanged.
- Preserve full-history detail correctness when the user opens `상세 리포트`.
- Add a focused contract test that exact search does not require full `getPlayerMatches()` work before first render unless the page is an explicitly expanded detail route.

## 2026-05-04 Stale Player-History Artifact Fix

### User-Reported Symptom

- After enabling the R2 player-history path, some player pages appeared to lose recent match data.
- Confirmed example: `5aee11bf-9641-4056-8290-8c4cae1efa49` showed the latest visible history date as `2026-04-07`.

### Evidence

- Supabase `players.match_history` for that player had 1869 rows and latest date `2026-05-02`.
- The matching R2 artifact `eloboard-male-29.json` had 1747 rows and latest date `2026-04-07`.
- `mergePlayerHistoryArtifact()` trusted any non-empty artifact before checking whether the Supabase fallback history was fresher.

### Fix

- Added a freshness selector in `lib/player-service.ts` so artifact history only wins when it is at least as fresh as the Supabase embedded history.
- If Supabase has a newer latest `match_date` than the artifact, the service keeps Supabase history.
- Added a contract in `scripts/tools/player-history-artifacts.test.js` to prevent blind artifact overrides from returning.

### Verification

- `npm.cmd run test:player-history-artifacts`
- `npm.cmd run test:player-history-artifact-cache-contract`
- `npm.cmd run test:player-page-payload-contract`
- `npm.cmd run test:h2h-route-performance-contract`
- `npm.cmd run test:matchup-zero-h2h-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`

## 2026-05-04 Player Detail Payload And Size Guards

### Scope

- Keep the precomputed detail summary stored in `players.detailed_stats`.
- Avoid sending bulky `detailed_stats` and `match_history` through the first-card client prop after the server has already seeded summaries from them.
- Make prod-sync report the largest `detailed_stats` and `player_detail_summary` payload sizes so future cost/capacity growth is visible.

### Completed

- `app/player/player-page-view.tsx` now builds a client-safe player card payload with `detailed_stats` and `match_history` set to `null` after precomputed summaries are seeded server-side.
- `scripts/tools/supabase-prod-sync.js` now caps precomputed expanded-report `recent_logs` with `PLAYER_DETAIL_SUMMARY_RECENT_LOG_LIMIT = 25`.
- `prod_sync_history_quality_latest.json` now records max byte sizes for `detailed_stats` and `player_detail_summary`, plus the max precomputed `recent_logs` count.

### Verification Targets

- `npm.cmd run test:prod-sync`
- `npm.cmd run test:player-page-payload-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`
- `npm.cmd run verify:predeploy`

### Verification

- `npm.cmd run test:prod-sync`
- `npm.cmd run test:player-page-payload-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`
- `npm.cmd run verify:predeploy`

## 2026-05-04 Precomputed Player-Card Recent Metrics

### Scope

- Keep the heavy detail report lazy-loaded.
- Move only the first-card recent 90-day summary and recent 5-match form into precomputed serving data.
- Store the new summary inside existing `players.detailed_stats` to avoid a schema migration in this pass.
- Do not change locked labels.

### Implementation Plan

- Extend prod-sync `buildDetailedStats()` so it writes `recent_90` alongside existing `race_stats`, `map_stats`, `last_10`, and `win_rate`.
- Add a player-detail summary helper that reads `detailed_stats.recent_90` and `detailed_stats.last_10` into the existing `RecentSummary` shape.
- Seed collapsed exact-search cards with that precomputed summary before `상세 리포트` is opened.
- Keep full `buildPlayerDetailSummary()` as the authoritative expanded report.

### Verification Targets

- `npm.cmd run test:prod-sync`
- `npm.cmd run test:player-page-payload-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`

### Completed

- `scripts/tools/supabase-prod-sync.js` now writes `detailed_stats.recent_90`.
- `lib/player-detail-summary.ts` can seed the collapsed card's recent summary from `detailed_stats.recent_90` and `detailed_stats.last_10`.
- `app/player/player-page-view.tsx` passes that precomputed summary before the detail report is expanded.
- Existing production rows need the next prod-sync run before `recent_90` is present in Supabase.

### Verification

- `npm.cmd run test:prod-sync`
- `npm.cmd run test:player-page-payload-contract`
- `npm.cmd run test:player-history-artifacts`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`
- `npm.cmd run verify:predeploy`

## 2026-05-04 Precomputed Expanded Player Detail Summary

### Scope

- Keep `GET /api/player-detail-summary?id=...` as the expanded-report API.
- Let the API return a precomputed `players.detailed_stats.player_detail_summary` when that projection is fresh.
- Fall back to full history-derived calculation when the precomputed summary is absent or older than `players.last_match_at`.
- Avoid a schema migration by storing the projection inside existing `detailed_stats`.

### Completed

- `scripts/tools/supabase-prod-sync.js` now writes `detailed_stats.player_detail_summary` with race summaries, strongest/weakest maps, race best maps, spawn partner, recent logs, recent 90-day summary, and `latest_match_date`.
- `lib/player-detail-summary.ts` now exposes `getPrecomputedFullPlayerDetailSummary()` and checks projection freshness before using it.
- `buildPlayerDetailSummary()` now tries the fresh precomputed full summary before calling `playerService.getPlayerMatches()`.
- Contract coverage now guards both the prod-sync projection and the app fast path.

### Verification

- `npm.cmd run test:prod-sync`
- `npm.cmd run test:player-page-payload-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`
