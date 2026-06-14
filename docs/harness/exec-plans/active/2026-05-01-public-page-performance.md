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

Shadow follow-up:

- Removed shadow classes from the tier card body, tier live badge, live hover
  preview shell, and hover preview live badge.
- Added contract assertions so these tier card/preview shadows are not
  reintroduced accidentally.

Verification:

- `npm.cmd run test:tier-page-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
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
- Superseded on 2026-05-16: name-only `getInstantH2H` fallback was removed, and H2H now requires both selected canonical player IDs.
- Changed detailed H2H artifact loading to read P1 history first and read P2 history only as a reciprocal fallback when P1 has no matching entries.
- Added a 300 second `unstable_cache` wrapper for ID-based detailed H2H stats, tagged with `public-player-history`, so repeated matchup checks avoid redoing the Supabase/R2 path.
- Changed the shared client matchup helper so `fetchH2HStats()` makes one API request when both player IDs are present; the old non-ID name-candidate fallback is now closed.
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

## 2026-05-04 Post-Sync Verification Checklist

### Current Sync Run

- GitHub Actions run: `https://github.com/sanpark9038/nzu-homepage-v2/actions/runs/25320104806`
- Trigger: manual `NZU Ops Pipeline` dispatch with `with_supabase_sync=true`
- Commit under test: `16c57b2`
- Expected duration: roughly 40-60 minutes based on recent scheduled runs.

### Check After The Run Completes

- Confirm the Actions run conclusion is `success`.
- Confirm `Run manual refresh` completed as a Supabase sync, not collect-only.
- Confirm `tmp/reports/prod_sync_history_quality_latest.json` from the run includes:
  - `detailed_stats_max_bytes`
  - `detailed_stats_largest_player`
  - `player_detail_summary_max_bytes`
  - `player_detail_summary_largest_player`
  - `player_detail_summary_max_recent_logs`
- Confirm `player_detail_summary_max_recent_logs` is no more than `25`.
- Confirm a production player API/detail summary response for `5aee11bf-9641-4056-8290-8c4cae1efa49` still returns 200.
- Confirm 김지성's latest visible history reaches the fresher Supabase date instead of the stale `2026-04-07` R2 artifact date.
- Confirm `/player?query=김지성` shows the first-card recent 3-month summary after the sync has populated `detailed_stats.recent_90`.
- Confirm opening `상세 리포트` returns the expanded report from the summary API without console errors.
- Smoke-check `/api/stats/h2h` for a known ID-based matchup still returns 200.

### Separate Cleanup Note

- `docs/harness/exec-plans/active/2026-05-01-prediction-ux-admin-flow.md` and `public/prediction-layout-preview.html` belong to a separate prediction UX/admin-flow effort.
- Keep them out of the player/R2 performance cleanup commit stream.

### Result

- Actions run `25320104806` completed successfully on commit `16c57b2`.
- `Run manual refresh` completed with Supabase sync enabled.
- Production sync report included the new size fields:
  - `detailed_stats_max_bytes`: `5426`
  - `detailed_stats_largest_player`: `김윤환`
  - `player_detail_summary_max_bytes`: `4249`
  - `player_detail_summary_largest_player`: `있찌`
  - `player_detail_summary_max_recent_logs`: `25`
- 김지성 production row after sync:
  - `last_match_at`: `2026-05-02T00:00:00+00:00`
  - `match_history_latest`: `2026-05-02`
  - `recent_90`: `404` matches, `190` wins, `214` losses, `47.03%`
  - `player_detail_summary.latest_match_date`: `2026-05-02`
  - `player_detail_summary.recent_logs`: `25`
- Production smoke checks returned 200 for `/player?query=김지성`, `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`, and ID-based `/api/stats/h2h`.
- Browser check opened 김지성's `상세 리포트` without console errors.
- Follow-up needed: GitHub Actions skipped player-history R2 artifact upload with `missing_r2_env`; `PLAYER_HISTORY_R2_ACCOUNT_ID` is missing from repo secrets.
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

## 2026-05-13 Public UX Baseline Audit

### Scope

- Measure current public-route performance before more UI work.
- Check desktop and mobile rendering for the main public pages.
- Confirm whether the existing `/schedule` page is good enough to promote into visible navigation, or whether it needs a focused redesign first.
- Check whether `STAR-HOSAGA.COM` is connected to the Vercel project, separately from the already documented `images.star-hosaga.com` R2 image domain.
- Decide the `/tier` default-mode question from evidence, while preserving the locked `티어표` navigation label and `/tier` target unless the operator explicitly asks for a wording/navigation change.

### Routes To Audit

- `/`
- `/prediction`
- `/tier`
- `/tier?liveOnly=true`
- `/player`
- `/entry`
- `/match`
- `/schedule`

### Evidence To Collect

- Production deployment status after the current push.
- HTTP timing samples for the route set above.
- Browser/mobile checks for layout overlap, horizontal overflow, blank states, and console errors.
- Current Vercel domain list or equivalent CLI evidence for `star-hosaga.com`.

### Non-Goals

- Do not change UI labels during the audit.
- Do not redesign `/schedule` until the current state is measured.
- Do not change the `/tier` default mode during the audit.
- Do not write production data.

### Audit Results

- Current push/deploy baseline:
  - `main` was pushed through `c5b3852`.
  - Vercel production deployment `https://nzu-homepage-v2-oejbqnf6g-sanparks-projects.vercel.app` reached `Ready`.
  - Production aliases remain Vercel-generated: `nzu-homepage-v2.vercel.app`, `nzu-homepage-v2-sanparks-projects.vercel.app`, and `nzu-homepage-v2-git-main-sanparks-projects.vercel.app`.
- Production HTTP timing samples:
  - `/`: 887ms cold-ish, then 26ms / 25ms, 21KB.
  - `/prediction`: 445ms, then 44ms / 26ms, 23KB.
  - `/tier`: 4909ms, then 1991ms / 1945ms, about 2.18MB.
  - `/tier?liveOnly=true`: 1403ms / 2227ms / 1875ms, about 80KB.
  - `/player`: 544ms / 235ms / 489ms, 18KB.
  - `/entry`: 608ms, then 48ms / 47ms, 75KB.
  - `/match`: 461ms / 40ms / 286ms, 22KB.
  - `/schedule`: 465ms, then 27ms / 25ms, 24KB.
- Browser checks:
  - Mobile viewport `390x844`: no horizontal overflow and no framework error overlay on `/`, `/prediction`, `/tier`, `/tier?liveOnly=true`, `/player`, `/entry`, `/match`, or `/schedule`.
  - Desktop viewport `1440x1000`: no horizontal overflow and no framework error overlay on the same route set.
  - `/tier` remains the only sampled public route with clearly heavy first-response/payload cost.
- `/tier` bottleneck:
  - `app/tier/page.tsx` already uses `getCachedPlayersList()` for default mode and `getLivePlayers()` for `liveOnly=true`.
  - The remaining cost is rendering/sending the full tier grid and all player cards, not the old uncached player-list read.
  - Keep `/tier` as the default visible navigation target for now. Making live-only the default would shrink the page, but it can make the first visit look empty when no player is live or live freshness fails closed.
- `/schedule` readiness:
  - The route is fast, but current production content still includes placeholder/test data such as `임시 1팀`, `임시 2팀`, and `Quarterfinal Match 2 (TEST)`.
  - Do not promote `/schedule` into visible navigation until tournament schedule content and fallback behavior are cleaned up.
- Domain status:
  - `vercel domains list` under `sanparks-projects` only showed `sig-mania.com`; `star-hosaga.com` is not attached to Vercel.
  - Latest Vercel deployment aliases do not include `star-hosaga.com` or `www.star-hosaga.com`.
  - DNS lookup for `star-hosaga.com` returned only Cloudflare authority data; `www.star-hosaga.com` did not resolve.
  - `images.star-hosaga.com` resolves through Cloudflare, matching the prior R2 image-domain setup, but its root URL returns 404.

### Recommended Next Implementation Slice

1. Keep `/tier` default as the full player list and keep the live-only toggle as an explicit filter.
2. Optimize `/tier` next by reducing first response/payload weight:
   - keep full list data cached,
   - render a lighter default tier card/list summary,
   - defer or progressively expand expensive per-player card detail,
   - preserve the current filter labels and `/tier` URL.
3. Treat `/schedule` as the next product page after the tier payload fix:
   - remove placeholder/test schedule data from the public default,
   - define the empty/fallback state,
   - then decide whether to expose `대회일정` in visible navigation.
4. Connect `star-hosaga.com` as a separate ops task:
   - add apex and `www` to the Vercel project,
   - set Cloudflare DNS according to Vercel's required records,
   - choose canonical redirect behavior before changing public links.

### 2026-05-13 Tier Lightweight Card Slice

Completed:

- Added a server-rendered `TierPlayerCard` for `/tier` grids so the full player list no longer hydrates the shared rich `PlayerCard` for every player.
- Added `TierQuickH2HButton` as the small client island that preserves the quick H2H action.
- Switched `TierGroup` and `TeamTierCompactGrid` to the lightweight card while keeping `/tier` as the default full-list page.
- Narrowed `H2HSelectorBar` to consume `MatchupPlayerSummary` instead of full player objects.
- Added contract coverage that prevents tier grids from regressing back to unconditional rich `PlayerCard` hydration.

Verification:

- `npm.cmd run test:tier-page-cache-contract`
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:matchup-helpers` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- Browser check, local dev server:
  - mobile `390x844` `/tier`: 316 cards, no horizontal overflow, no browser errors.
  - mobile `390x844` `/tier?liveOnly=true`: 43 cards, no horizontal overflow, no browser errors.
  - desktop `1440x1000` `/tier`: 316 cards, no horizontal overflow, no browser errors.
  - first quick H2H button opened the existing quick matching bar.
- `npm.cmd run pipeline:health`
- `npm.cmd run verify:predeploy` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)
- `npm.cmd run lint`
- `git diff --check`

Next:

- Treat `/schedule` as the next product slice. The safest path is a contract test that requires `/schedule` to load explicit prediction state instead of exposing local temporary prediction-match fallback data.
- Keep `star-hosaga.com` as an ops checklist unless the operator explicitly approves Vercel/Cloudflare production configuration writes.

### 2026-05-13 Schedule Fallback Cleanup Slice

Completed:

- Updated `/schedule` to load explicit prediction state with `loadPredictionState()` and pass it into `buildTournamentPredictionMatches(players, predictionState)`.
- Emptied the local prediction-match fallback seed so public schedule output cannot fall back to old test/temporary rows.
- Added `test:schedule-page-data-source-contract` and included it in `verify:predeploy`.
- Preserved the existing visible schedule labels and did not promote `/schedule` into visible navigation.

Verification:

- `npm.cmd run test:schedule-page-data-source-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npm.cmd run test:prediction-store-contract` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- Browser check, local dev server:
  - mobile `390x844` `/schedule`: no horizontal overflow, no browser errors, no `TEST`/`Temporary`/`placeholder`/`임시` text.
  - desktop `1440x1000` `/schedule`: no horizontal overflow, no browser errors, no fixture text.
- `npm.cmd run pipeline:health`
- `npm.cmd run verify:predeploy` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)

Next:

- Domain connection remains an ops task: document exact Vercel/Cloudflare steps only, and do not change production DNS/Vercel settings without explicit approval.

### 2026-05-13 Tier Payload Correction Slice

Finding:

- After deploying `0428d4e`, production alias measurements showed `/tier` still returned about 2.55MB of HTML and `/tier?liveOnly=true` about 504KB. Hydration pressure was lower, but the server-rendered card still emitted image-heavy markup for every tier entry.

Completed:

- Made `TierPlayerCard` text-first for the initial tier route payload.
- Removed per-card `next/image` and SOOP profile image URL resolution from the tier grid card.
- Kept race, tier, university, live indicator, `전적 보기`, and quick H2H behavior.
- Added a contract that prevents the tier lightweight card from reintroducing initial-route image markup.

Verification:

- `npm.cmd run test:tier-page-cache-contract`
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:matchup-helpers` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)
- `npx.cmd tsc --noEmit` (one parallel run raced with `next build`; standalone rerun passed)
- `npm.cmd run build`
- `npm.cmd run lint`
- Browser check, local dev server:
  - mobile `390x844` `/tier`: 316 cards, no horizontal overflow, tier cards contain no images.
  - desktop `1440x1000` `/tier?liveOnly=true`: live cards render, no horizontal overflow, tier cards contain no images.
- `npm.cmd run pipeline:health`
- `npm.cmd run verify:predeploy` (sandbox `spawn EPERM` on first run; rerun with approved permissions passed)

Next:

- Push the correction and remeasure production alias payload for `/tier`, `/tier?liveOnly=true`, and `/schedule`.

Production remeasure after `e5f400f`:

- Deployment `https://nzu-homepage-v2-61wyawief-sanparks-projects.vercel.app` reached `Ready`; the protected deployment URL itself requires Vercel authentication, so public measurements used canonical alias `https://nzu-homepage-v2.vercel.app`.
- `/tier`: 5 samples, 1.63s-2.70s, 1,718,484 bytes, `X-Vercel-Cache: MISS`.
- `/tier?liveOnly=true`: 5 samples, 0.82s-1.56s, about 365,841-365,913 bytes, `X-Vercel-Cache: MISS`.
- `/schedule`: 5 samples, 23ms-462ms, 20,342 bytes, `X-Vercel-Cache: STALE` then `HIT`.

Result:

- `/tier` initial HTML payload is now below the earlier 2026-05-13 audit baseline of about 2.18MB, and down from the first lightweight-card deployment's about 2.55MB.
- Route-level `/tier` latency is still limited by dynamic SSR and repeated `MISS` responses; the next performance slice should evaluate route caching/revalidation without breaking live-state freshness expectations.

### 2026-05-13 Domain Connection Checklist

Current state:

- `star-hosaga.com` and `www.star-hosaga.com` are not attached to the Vercel project aliases.
- `star-hosaga.com` currently has Cloudflare authority data only; `www.star-hosaga.com` does not resolve.
- `images.star-hosaga.com` is a separate Cloudflare/R2 image domain and must be left untouched during apex/www web-domain setup.

Operator checklist:

1. In Vercel project `nzu-homepage-v2`, add both `star-hosaga.com` and `www.star-hosaga.com`.
2. Run `vercel domains inspect star-hosaga.com` and `vercel domains inspect www.star-hosaga.com`; use the exact records from inspect output.
3. In Cloudflare DNS, remove conflicting apex/www records, then add the Vercel-required records. Vercel's general pattern is apex `A 76.76.21.21` and `www` CNAME to a Vercel DNS target, but inspect output is the source of truth.
4. Keep the new Cloudflare apex/www records DNS-only at first for the lowest-risk certificate path. Do not use Cloudflare Flexible SSL, and do not block `/.well-known/acme-challenge/*`.
5. Prefer `star-hosaga.com` as canonical and redirect `www` to apex unless the operator chooses the opposite.
6. Verify with Vercel domain inspect, DNS lookup for apex/www, and browser smoke checks for `/`, `/tier`, `/prediction`, and `/schedule`.
7. After the domain is live, update serving-cache revalidation configuration such as GitHub Actions `SERVING_REVALIDATE_URL` and the matching Supabase Edge secret/env to `https://star-hosaga.com`.

No production Vercel, Cloudflare, GitHub, or Supabase configuration was changed in this slice.

### 2026-05-13 Tier Route Revalidation Slice

Goal:

- Reduce repeated dynamic `/tier` server work after the payload correction, without making the public live-only view depend on stale SOOP state.

Completed:

- Removed the explicit `force-dynamic` / `revalidate = 0` route setting from `app/tier/page.tsx`.
- Set the default `/tier` route revalidation to `60` seconds.
- Split the query-aware tier renderer into `app/tier/query/page.tsx` and shared `app/tier/TierPageView.tsx`.
- Added query-specific proxy rewrites so `/tier` with tier filter parameters is internally served by `/tier/query` while the visible URL stays `/tier?...`; the no-query default `/tier` path does not run this rewrite.
- Kept the existing data split: default `/tier` uses `getCachedPlayersList()`, and `/tier?liveOnly=true` still uses `getLivePlayers()` through the query route.
- Added Suspense boundaries around `useSearchParams()` filter controls so default `/tier` can prerender.
- Updated the tier cache contract so future edits do not silently restore `force-dynamic`, `revalidate = 0`, or page-level `searchParams` on the default `/tier` route.

Freshness note:

- `getLivePlayers()` still applies the public live overlay, which fails closed for stale DB live rows.
- Route-level revalidation can add up to about 60 seconds of public HTML staleness. This is acceptable for the current performance slice because the SOOP live-state guard still prevents old DB live rows from being treated as fresh truth.
- Filtered query URLs may remain dynamic because `/tier/query` intentionally reads `searchParams`. The high-traffic default `/tier` route no longer does.
- Local `next build` now reports static `/tier` with `1m` revalidation and dynamic `/tier/query`, which is the intended split.

Verification:

- `npm.cmd run test:tier-page-cache-contract` (red before implementation, green after)
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:player-live-overlay`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- Browser check, local dev server:
  - `/tier`: 316 cards, no horizontal overflow, no framework overlay or browser errors.
  - `/tier?liveOnly=true`: 64 cards, no horizontal overflow, no framework overlay or browser errors.
  - Clicking the school filter from `/tier?liveOnly=true` kept the visible URL as `/tier?liveOnly=true&univ=MBU` and rendered the filtered result.
- `npm.cmd run pipeline:health`
- `npm.cmd run verify:predeploy`

Deployment checks:

- Commit and push the route revalidation change.
- Wait for the Vercel production deployment to become `Ready`.
- Remeasure canonical alias routes `/tier`, `/tier?liveOnly=true`, and `/schedule`.

Production remeasure after `b3c843b`:

- Deployment `https://nzu-homepage-v2-nz3w7hjpv-sanparks-projects.vercel.app` reached `Ready`; public measurements used canonical alias `https://nzu-homepage-v2.vercel.app`.
- `/tier`: 5 samples, 713ms-1.95s, 1,719,483 bytes, first sample `X-Vercel-Cache: PRERENDER`, then `HIT` with increasing `Age`.
- `/tier?liveOnly=true`: 5 samples, 1.64s-2.64s, 423,786 bytes, `X-Vercel-Cache: MISS`.
- `/schedule`: 5 samples, 24ms-476ms, 20,342 bytes, first sample `PRERENDER`, then `HIT`.

Result:

- Default `/tier` is no longer stuck on repeated route-level `MISS`; the route split achieved the cache objective.
- The explicit live-only query remains dynamic by design so it can continue using the live-only serving path and freshness overlay.
- The next performance bottleneck for default `/tier` is still response size, not repeated SSR. Further work should target reducing or virtualizing the initial full-list HTML payload.

### 2026-05-14 Tier Profile Image Follow-up

- User review found that the lightweight tier card had removed visible player
  profile images entirely. The earlier payload reduction solved response size
  but created a UX regression.
- Restored a compact fixed-size profile image in `TierPlayerCard` while keeping
  the shared hydrated `PlayerCard` out of the tier grid.
- Follow-up correction: live players now keep the compact profile image in the
  profile slot and render `live_thumbnail_url` through the SOOP thumbnail proxy
  as a hover-only live preview that floats outside the card, matching the
  reference behavior. The thumbnail must not replace the profile image and must
  not appear as a persistent panel inside the card.
- Updated `scripts/tools/tier-page-cache-contract.test.js` so the contract now
  protects both goals: compact player media remains visible, live thumbnails are
  hover previews when present, and the tier grid still does not rehydrate the
  shared card component.
- User follow-up: the hover preview was too small and the inline `LIVE` badge
  compressed short Korean player names into ellipses. The preview is now a
  larger 16:9 `w-[34rem]` hover panel, and the live badge is positioned
  absolutely outside the player-name text flow.
- User follow-up: toggling `방송중` changed the URL to `/tier?liveOnly=true`
  but the server-rendered list stayed on the cached default `/tier` payload.
  Root cause was client-only search-param navigation (`router.push("?…")`) not
  reliably entering the proxy-backed `/tier/query` server route. Tier filters
  now navigate to the full `/tier?...` URL so the proxy rewrite performs a fresh
  server render for filtered/live data.

### 2026-05-14 Tier Toggle Interaction Performance Slice

Goal:

- Reduce visible jank when changing the tier page `liveOnly` filter.
- Keep the live-only data correctness restored by the proxy-backed `/tier/query`
  route.
- Avoid pre-rendering every live hover thumbnail image in the initial tier page
  HTML.

Planned:

- Add a contract that live hover preview images are lazy-mounted by a focused
  client component instead of being emitted directly by `TierPlayerCard`.
- Replace hard `window.location.assign(...)` filter navigation with app-router
  navigation plus an explicit refresh, then verify that the live-only card list
  still updates on port 3000.
- Remeasure local DOM/image counts before considering heavier virtualization.

Completed:

- Added `TierLiveHoverPreview` as a focused client component. It emits only the
  hover-preview shell initially, attaches `pointerenter` and `focusin` listeners
  to the card wrapper, and mounts the thumbnail image after the first hover or
  focus.
- Updated `TierPlayerCard` so profile images remain visible, but live thumbnail
  images are no longer emitted directly in the server-rendered card markup.
- Replaced hard tier filter navigation with app-router `router.push(target, {
  scroll: false })` followed by `router.refresh()`.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before implementation and
  passed after implementation.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Local browser check on port 3000:
  - `/tier`: 316 cards, 316 images, 128 hover-preview shells, 0 hover-preview
    images before hover.
  - Clicking `liveOnly` changed the visible URL to `/tier?liveOnly=true`,
    reduced cards to 128, kept browser navigation entries at 1, and still had 0
    hover-preview images before hover.
  - Dispatching the first hover mounted 1 hover-preview image.

Follow-up after user clarified that all cards must still render at once:

- Removed `router.refresh()` from tier filter navigation after verifying full
  `/tier?...` app-router navigation is enough to enter the proxy-backed query
  route.
- Kept all tier cards rendered at once. No virtualization, infinite scroll, or
  per-tier delayed rendering was introduced.
- Added `sizes="76px"` to compact profile images so the fixed 76px media slot
  gives the browser a precise source-size hint.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the follow-up
  implementation and passed after.
- Local browser check on port 3000:
  - `/tier`: 316 cards, 316 images, 0 hover-preview images before hover.
  - Clicking `liveOnly` changed the visible URL to `/tier?liveOnly=true`,
    reduced cards to 132, kept browser navigation entries at 1, and still had 0
    hover-preview images before hover.
- Browser errors output was empty.
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`

Follow-up after user noticed apparent card re-positioning on tier render:

- Root cause: `TierPageView` rendered client filter controls behind `Suspense`
  fallback blocks whose reserved heights did not match the final filter/button
  layout. The school filter then changed height after hydration and pushed the
  tier card grid into its final position.
- Secondary visual cause: tier cards and profile images used hover translate /
  scale transitions, and active school filters used `scale-105`, which made the
  grid feel like it was briefly growing even when layout was stable.
- Updated the filters to receive the server-built `queryString` prop instead
  of calling `useSearchParams()`, removed the `Suspense` wrappers/fallbacks from
  `TierPageView`, and removed the tier-card/profile transform effects.
- Follow-up correction: removed the remaining `/tier` page-level `fade-in`
  transform animation and the right-side tier navigation scale transition after
  user still perceived a slight grow-and-return motion.
- Kept all tier cards rendered at once. No virtualization, infinite scroll, or
  delayed card rendering was introduced.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the layout-shift
  fix and passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Local browser check on port 3000:
  - `/tier`: 316 cards, 316 images, 0 hover-preview images before hover.
  - First card top stayed at 516px after 2 seconds, so no observed post-load
    vertical shift.
  - Toggling `liveOnly` changed the URL to `/tier?liveOnly=true`, rendered the
    current live-only card list, kept 0 hover-preview images before hover, and
    kept first card top at 516px after 2 seconds.
  - Browser errors output was empty.
- Follow-up local browser check on port 3000 after removing page-level
  transform animations:
  - `/tier`: 316 cards.
  - First card left/top/width stayed `61.5 / 516 / 208` after 2 seconds.
  - `main.getAnimations().length` was 0.
  - Browser errors output was empty.

Follow-up after user asked for faster tier rendering while keeping all cards
rendered at once:

- Kept the visible tier card button layout unchanged, but converted
  `TierQuickH2HButton` from a per-card client component into server-rendered
  button markup with data attributes.
- Added one delegated click listener in `H2HSelectorBar` that reads the clicked
  tier button's player summary and dispatches the existing `add-h2h-player`
  event. This removes 316 per-card hydrated quick-add button handlers from the
  tier grid while preserving the current UX.
- Kept all tier cards rendered at once. No virtualization, infinite scroll, or
  delayed card rendering was introduced.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the delegated
  quick-add implementation and passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Local browser check on port 3000, using the already-running node server:
  - `/tier`: 316 cards, 316 delegated quick-add buttons, 0 hover-preview images
    before hover.
  - Clicking the first delegated quick-add button created the H2H selector bar
    with the selected player.
  - Browser errors output was empty.

Production-like local remeasure after user still felt `/tier` was slow:

- The old port 3000 node server returned `Cache-Control: no-store,
  must-revalidate` and produced much heavier local timings:
  - `/tier`: about 6.8MB decoded HTML, about 1,290 script tags, about 1,265
    `self.__next_f.push` chunks, 316 cards, 316 images, 636 SVGs.
  - Browser timing on that server: FCP about 5.4s, navigation duration about
    6.9s, DOM nodes about 8.8k.
- Restarted port 3000 with `next start -p 3000` against the current build and
  remeasured:
  - HTTP samples: 3.38MB / 2.1s first sample, then 3.25MB / 1.4s and 1.3s.
  - `Cache-Control: s-maxage=60, stale-while-revalidate=31535940`.
  - Script tags dropped to about 360, `self.__next_f.push` chunks to about
    345, but 316 cards, 316 images, and 636 SVGs remained.
  - Browser timing on production-like 3000: FCP about 2.45s, navigation
    duration about 3.05s, decoded document about 3.45MB, DOM nodes about 7.9k,
    0 hover-preview images before hover.
- Conclusion: the local dev/non-cache server exaggerated the slowness, but the
  remaining real bottleneck is still the full initial card payload: all 316
  cards, their image markup, repeated SVG icons/badges, and the serialized RSC
  payload.

Follow-up after user chose reference-style live-centered default:

- Changed tier page semantics so `/tier` is live-centered by default. `liveOnly`
  is now true unless the URL explicitly has `liveOnly=false`.
- Updated the live toggle so turning broadcasting mode back on removes the
  `liveOnly` query parameter and returns to canonical `/tier`; turning it off
  writes `liveOnly=false` so the full tier table remains available.
- This keeps a visible "all players" path while making the first tier-page load
  closer to the reference site pattern.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before implementation and
  passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Production-like local `next start -p 3000` HTTP measurement:
  - `/tier`: 145 cards, 145 images, 294 SVGs, 192 RSC push chunks, about
    1.68MB decoded HTML, about 666ms response time, `s-maxage=60`.
  - `/tier?liveOnly=false`: 316 cards, 316 images, 636 SVGs, 366 RSC push
    chunks, about 3.40MB decoded HTML, about 2.8s response time.

Follow-up after comparing the reference site's full tier view:

- User confirmed the target is closer to the reference site's model: tiny
  document shell plus Fetch/XHR data, not MB-scale server-rendered card HTML.
- Added `/api/tier/players`, returning compact JSON for the current tier query.
  It uses live-centered default semantics and keeps `liveOnly=false` as the
  explicit full-table path.
- Moved the tier controls, grouping, cards, and H2H selector into
  `TierClientView`. `TierPageView` now only builds the query string and passes
  static university metadata into the client shell.
- This changes initial tier rendering from server-emitted card HTML/RSC to
  client rendering after the compact API response. The visible card UI remains
  the same after data loads.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the client/API shell
  existed and passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Production-like local `next start -p 3000` HTTP measurement:
  - `/tier`: about 31KB document, 0 article tags, 0 image tags, 4 SVGs, 5 RSC
    push chunks, about 141ms response time.
  - `/tier?liveOnly=false`: about 32KB document, 0 article tags, 0 image tags,
    4 SVGs, 3 RSC push chunks, about 58ms response time.
  - `/api/tier/players`: about 83KB JSON, about 470ms response time,
    `s-maxage=30`.
  - `/api/tier/players?liveOnly=false`: about 162KB JSON, about 87ms response
    time, `s-maxage=300`.
- Browser check on production-like port 3000:
  - `/tier`: FCP about 644ms, document decoded about 31KB, API JSON about 83KB,
    147 rendered cards after data load, 0 hover-preview images before hover.
  - `/tier?liveOnly=false`: FCP about 116ms, document decoded about 32KB, API
    JSON about 149KB, 316 rendered cards after data load, 0 hover-preview
    images before hover.
  - Browser errors output was empty.

Follow-up after user found the full-player toggle did not update the rendered
list:

- Root cause: after the `/tier` shell moved to client-side data loading,
  `router.push("/tier?...")` changed the visible URL but the mounted
  `TierClientView` continued using the original server-provided `queryString`.
  The page therefore stayed on the previous `/api/tier/players` payload and did
  not request `/api/tier/players?liveOnly=false`.
- Added an active client query state in `TierClientView` that syncs from
  `window.location.search`, `popstate`, and a focused
  `tier-filter-query-change` event emitted by the filter controls.
- Changed tier filter navigation to update the visible URL with
  `window.history.pushState` instead of remounting the App Router tree, then
  dispatch the query-change event for the already-mounted shell.
- Added a small module-level request promise cache so repeated/remounted reads
  for the same `/api/tier/players...` URL reuse the same payload promise.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before each fix slice and
  passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on production-like port 3000:
  - `/tier`: rendered the current live-only list and `data-tier-live-only=true`.
  - Turning the live toggle off changed the URL to `/tier?liveOnly=false`,
    rendered 316 cards and 316 profile images, and set
    `data-tier-live-only=false`.
  - The browser navigation entry count stayed at 1 and browser errors output
    was empty.

Follow-up after user asked to try `content-visibility`:

- Added group-level `content-visibility: auto` through the
  `tier-content-visibility` utility class on `TierGroup`.
- Set `contain-intrinsic-size: auto 44rem` so offscreen tier sections keep a
  reasonable reserved height while allowing the browser to remember real sizes
  after rendering.
- Kept every player card in the DOM. No virtualization, infinite scroll, card
  slicing, or delayed data loading was introduced.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before implementation and
  passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on production-like port 3000:
  - `/tier?liveOnly=false`: rendered 316 cards and 316 profile images.
  - 15 tier groups had `content-visibility: auto`; computed
    `contain-intrinsic-size` was `auto 704px`.
  - Browser errors output was empty.

Follow-up after user found top-row live hover previews were clipped:

- Root cause: the hover preview was still an absolute child of the tier card.
  With `content-visibility: auto` on each `TierGroup`, the browser can paint
  contain that group, so a preview extending above the group's top edge was
  clipped even with a high z-index.
- Changed `TierLiveHoverPreview` so the card keeps only a small client hover
  anchor, while the actual 16:9 live thumbnail preview is rendered through a
  `document.body` portal as a fixed, viewport-aware overlay.
- Kept lazy mounting: the live thumbnail image is still created only after the
  first hover/focus for that card.
- Kept all tier cards in the DOM and kept the `content-visibility` performance
  experiment in place.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the portal/fixed
  preview implementation and passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on production-like port 3000:
  - `/tier?liveOnly=false`: rendered 316 cards and 316 profile images.
  - Dispatching hover on the first live-preview anchor rendered one
    `data-live-thumbnail-hover-preview` element directly under `document.body`.
  - The preview measured `position: fixed`, `z-index: 999`, top/bottom
    `198/505` in a `1264x625` viewport, and was fully inside the viewport.
  - Browser errors output was empty.

Follow-up measurement before considering no-profile-image tier cards:

- Goal: check whether removing compact profile images is likely to be worth the
  UX change before doing the design work.
- Server state: production-like `next start -p 3000` on the current build.
- HTTP samples:
  - `/tier`: 30.9KB document, 0 article tags, 0 image tags. After the first
    local sample, warm responses were about 43-85ms with `s-maxage=60`.
  - `/tier?liveOnly=false`: 31.3KB document, 0 article tags, 0 image tags,
    about 110-221ms, `no-store` query route shell.
  - `/api/tier/players`: 88.4KB JSON, 146 players, observed 275-1468ms across
    local samples with `s-maxage=30`.
  - `/api/tier/players?liveOnly=false`: 153-171KB JSON, 324 API players,
    observed 215-311ms with `s-maxage=300`.
- Browser initial render:
  - `/tier`: 142 rendered cards, 142 image elements, 22 decoded profile images,
    288 SVGs, about 3.7K DOM nodes, one API request.
  - `/tier?liveOnly=false`: 316 rendered cards, 316 image elements, 21-30
    decoded profile images at the top of the page, 636 SVGs, about 7.6K DOM
    nodes, one API request after reopening the browser session.
  - All profile images had lazy loading; the page does not immediately fetch or
    decode all 316 profile images on first paint.
- Browser scroll-through measurement on the real internal scroll container:
  - After scrolling through the full table, all 316 profile images were decoded.
  - Resource timing showed 108 image resource entries and about 30MB decoded
    image body size in that browser session.
- Toggle measurement:
  - Warm real `liveOnly=false` transition from `/tier`: API response about
    53ms, 316-card DOM completion about 351ms after the filter event.
  - Cache-busted measurement query showed the cold path can be dominated by the
    API: about 3.3s API duration and about 4.0s until 316 cards were present.
- Conclusion:
  - Removing profile images is unlikely to be the highest-impact fix for the
    warm initial tier transition because offscreen profile images are lazy.
  - Profile images do matter during full-table scroll-through and memory/image
    decode pressure.
  - The next lowest-risk improvements should target measurable costs first:
    API cold/warm behavior, duplicated/large per-card DOM such as SVG/button
    markup, and possibly a small local-only no-profile-card A/B only if the
    user wants a visual trade-off check.

Follow-up after user chose to defer no-profile-image cards:

- Kept compact profile images and the current visible tier card design.
- Changed live hover preview from one client component per live card to one
  delegated `TierLiveHoverPreviewLayer` mounted by `TierClientView`.
- `TierPlayerCard` now only emits lightweight `data-live-thumbnail-*`
  attributes on live card wrappers. The global layer listens for document-level
  `pointerover`/`pointerout` and `focusin`/`focusout`, then renders the same
  body-level fixed 16:9 preview portal.
- This preserves the clipping fix, lazy thumbnail mount, keyboard focus support,
  and all visible labels while removing the repeated per-card preview state and
  effects.

Verification:

- `npm.cmd run test:tier-page-cache-contract` failed before the delegated
  layer implementation and passed after.
- `npm.cmd run test:tier-page-helpers`
- `npm.cmd run test:soop-thumbnail-performance-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on production-like port 3000:
  - `/tier?liveOnly=false`: rendered 316 cards, 316 profile images, and 140
    live-preview data anchors.
  - Before hover, there were 0 `data-live-thumbnail-hover-preview` elements.
  - Dispatching hover on the first live anchor rendered exactly 1 preview
    element under `document.body`; it measured `position: fixed`, `z-index:
    999`, `544x307`, and fully inside the viewport.
  - Dispatching pointerout kept the single reusable preview element and set its
    opacity to 0.
  - Browser errors output was empty.

Recent-record freshness check:

- User reported public player recent records still looked stale and wanted the
  issue closed today if possible.
- Read-only subagent split traced the public player detail serving path and the
  ops pipeline/R2 artifact path.
- Confirmed source freshness for `eloboard:male:37` (`김택용`) with a direct
  no-cache Eloboard read on 2026-05-15 KST: source returned `period_total=840`
  and `period_max_date=2026-05-14`.
- Current production row evidence from the same session still showed
  `players.match_history` latest date `2026-04-20`, with precomputed detail
  projections also ending at `2026-04-20`.
- Latest successful scheduled ops run inspected was `25830448942`, head SHA
  `1d3bf2c`, created `2026-05-13T22:37:07Z`. That run predates freshness guard
  commit `41ff6e2` (`Restore tier profiles and guard history freshness`).
- The currently checked-in guard is covered by
  `npm.cmd run test:player-collection-freshness-contract`, which passed in this
  session.
- Next production-affecting step requires operator approval: run the approved
  refresh/sync path on current code, then verify the public player detail cache
  reflects source dates after revalidation.

Recent-record refresh execution:

- User approved production refresh/sync on 2026-05-15 KST.
- Added a post-sync player-history freshness sentinel:
  - `scripts/tools/verify-player-history-freshness-sentinel.js` performs a
    no-cache source read for the FM-009 sentinel (`male:37`) and compares it to
    production serving history.
  - `push-supabase-approved.js` now runs the sentinel after the approved
    staging/prod sync and public-cache revalidation step.
  - `test:player-history-freshness-sentinel` is wired into
    `pipeline:health` and `verify:predeploy`.
- Hardened production sync so it refuses per-player match-history regressions,
  not just aggregate max-date regressions.
- First approved `pipeline:manual:refresh:with-sync` completed collection and
  staging sync, then correctly blocked production sync before prod writes
  because 4 incoming players were older than current production.
- Updated production sync to preserve newer existing production serving stats
  when current source history for that specific player is older, so a partial
  source regression does not overwrite fresher production history.
- Re-ran `pipeline:push:approved` successfully:
  - SOOP snapshot generated.
  - player-history artifacts uploaded to R2 (`314` files).
  - staging loaded `324` players.
  - production upserted `324` changed records.
  - final production row count verified at `324`.
  - freshness sentinel passed: `male:37` source latest `2026-05-14`, serving
    latest `2026-05-14`.
- Public verification:
  - `https://nzu-homepage-v2.vercel.app/api/player-detail-summary?id=027310b3-97df-4faf-9c78-83b85dcf6ea3`
    returned `200` and recent logs beginning with `26.05.14`.
- Cache revalidation note:
  - `revalidate-public-cache` skipped because local env lacked base URL/secret.
  - Wrapper reporting was corrected so this case is reported as `skipped`
    rather than `completed` in future runs.

Pipeline observability follow-up after repeated freshness failures:

- User concern: the data pipeline has become hard to reason about after nearly
  two months of repeated freshness and serving-data fixes.
- Root issue identified for the current class of failures: the pipeline had
  several guards that protected specific stages, but it did not produce a
  player-by-player explanation of source latest date versus production serving
  latest date. That made a stale player look like an isolated data bug instead
  of an observable pipeline-state mismatch.
- Added `scripts/tools/audit-player-history-freshness.js` as a read-only
  operator audit command. It builds candidates from durable metadata identity
  (`eloboard:gender:wr_id`), reads production serving rows, optionally performs
  no-cache source reads through `report-team-records.js`, and writes:
  - `tmp/reports/player_history_freshness_audit_latest.json`
  - `tmp/reports/player_history_freshness_audit_latest.md`
- Added `npm run report:player-history:freshness-audit` for manual/operator
  use. By default it checks a bounded high-priority slice; `-- --all` can be
  used when a full no-cache source audit is intentionally desired.
- Added `scripts/tools/player-history-freshness-audit.test.js` and wired
  `test:player-history-freshness-audit` into `pipeline:health` and
  `verify:predeploy`.
- This is intentionally not a production write path and does not deploy, push,
  or mutate Supabase. It is the missing state board for deciding whether a
  player is truly stale, source-missing, serving-missing, or fresh.
- Follow-up classification:
  - Initial no-source audit showed 14 metadata candidates without production
    serving rows.
  - After matching the same exclusion semantics as staging/prod sync, those 14
    rows were explained as `excluded_from_serving`, not stale serving failures.
  - Added `--visible-only` so expensive no-cache source audits can skip
    intentionally excluded rows.
  - A visible-only no-cache sample of 10 high-priority players found 5 real
    stale serving rows:
    `female:331`, `female:653`, `female:881`, `male:56`, `male:8`.
  - This confirms the recent-record issue is not limited to the original
    `male:37` sentinel. The next production-affecting step must be an approved
    targeted refresh/sync or a wider visible-player audit, not another blind
    full sync.

2026-06-11 performance candidate split:

- Created an isolated `origin/main` worktree at `C:\tmp\nzu-perf-candidate` on
  branch `codex/perf-menu-tier-candidate` to avoid mixing the already-deployed
  image optimization patch, original workspace docs/snapshot changes, and menu
  speed work.
- Kept SOOP live sync cadence at 10 minutes. The tier live delay candidate only
  reduces app-side freshness windows:
  - `/api/tier/players?live=1` cache: `s-maxage=10,
    stale-while-revalidate=60`.
  - tier client live request cache: `5_000` ms.
- Split query-bearing public menu URLs from cacheable base menu pages:
  - `/board` remains a cacheable 30-second public page.
  - `/board?...` rewrites internally to dynamic `/board/query`.
  - `/player` remains a cacheable 5-minute public page.
  - `/player?...` rewrites internally to dynamic `/player/query`.
- Candidate verification completed locally:
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:board:comments`
  - `npm.cmd run test:tier-page-cache-contract`
  - `npm.cmd run test:player-live-overlay`
  - `git diff --check`
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run lint`
  - `npm.cmd run build` with production env loaded from the original workspace.
  - `next start -p 3010` smoke checks for `/board`, `/player`,
    `/board?filter=schedule`, `/player?query=test`, and
    `/api/tier/players`.
  - agent-browser snapshots for `/board` and `/player` loaded without console
    errors.

2026-06-11 production tier measurement follow-up:

- Production HTTP samples after PRs #5-#7:
  - `/api/tier/players`: first observed MISS about 2.1s, HIT about 50-89ms,
    payload about 56KB decoded for 103 live players.
  - `/api/tier/players?liveOnly=false`: first observed MISS about 1.2s, HIT
    about 82-94ms, payload about 156KB decoded for 320 players.
  - `/tier`: first observed prerender about 522ms, then HIT about 31-40ms.
  - `/tier?liveOnly=false`: query route remained dynamic/no-store and returned
    about 324-354ms on warm samples.
- Browser production measurements:
  - `/tier`: 103 rendered cards, 103 image elements, 15 decoded images, 212
    SVGs, about 2.8K DOM nodes, API resource decoded body 56KB.
  - `/tier?liveOnly=false`: 320 rendered cards, 320 image elements, 33 decoded
    images, 646 SVGs, about 7.6K DOM nodes, API resource decoded body 156KB.
- Interpretation:
  - Live default mode is acceptable after the SOOP heartbeat fix; image decode
    is still lazy and not the first bottleneck.
  - The next measurable tier performance target is the all-player query path:
    it pays a dynamic no-store shell cost and a larger API payload/DOM cost.
  - A shell-cache improvement should remove the `/tier?*` rewrite dependency or
    otherwise avoid `searchParams`-driven dynamic SSR without causing an initial
    live-only API fetch before the client observes the browser query string.
  - A payload follow-up can narrow `/api/tier/players` to the fields used by
    tier cards, H2H quick add, filters, and profile links.

2026-06-11 tier API payload narrowing:

- Chose the lower-risk payload follow-up before changing the query-shell
  rewrite/caching behavior.
- Kept the fields required by the current tier client:
  `id`, `name`, `nickname`, `race`, `gender`, `tier`, `university`, `is_live`,
  `broadcast_title`, `channel_profile_image_url`, `live_thumbnail_url`, and
  `photo_url`.
- Removed currently unused tier API response fields:
  `tier_rank`, `eloboard_id`, `soop_id`, `broadcast_url`, `elo_point`,
  `total_wins`, `total_losses`, and `win_rate`.
- Kept filtering and excluded-player logic server-side before payload mapping,
  so the smaller client payload does not weaken tier filtering semantics.

2026-06-11 tier query shell cache follow-up:

- Re-measured production after payload narrowing:
  - `/tier` shell: HIT samples about 27-36ms after prerender.
  - `/tier?liveOnly=false` shell: still dynamic/no-store, warm samples about
    341-366ms.
- Changed the tier query strategy so `/tier?...` no longer rewrites through the
  dynamic `/tier/query` route. Query URLs now reuse the cacheable `/tier`
  shell.
- Strengthened `TierClientView` so initial client state reads
  `window.location.search` immediately. This preserves correct first API
  requests for `/tier?liveOnly=false`, search, race, university, tier, and
  race-group query URLs even though the server shell no longer reads
  `searchParams`.
- Kept `/board?...` and `/player?...` rewrites unchanged because those routes
  still rely on server query handling.

2026-06-11 tier H2H button SVG reduction:

- Continued the tier all-player rendering-cost pass after the query shell became
  cacheable.
- The production browser measurement before this pass showed
  `/tier?liveOnly=false` rendering 320 cards and 646 SVGs. Each quick H2H
  button contributed two repeated lucide SVGs (`Circle` and `Check`) even
  though the action is delegated through `data-tier-h2h-player`.
- Changed `TierQuickH2HButton` to render one `Plus` lucide icon while keeping
  the visible label and all delegated `data-player-*` attributes unchanged.
  This removes one repeated SVG per rendered tier card without changing the H2H
  selector behavior.
- Added a contract assertion so the tier quick H2H button keeps the single-icon
  shape and does not reintroduce the old `Circle`/`Check` pair.

Post-deploy measurement after PR #11:

- Production HTTP shell samples for `/tier?liveOnly=false`:
  - sample 1: 778ms, `X-Vercel-Cache: PRERENDER`, `X-Matched-Path: /tier`,
    41,884 bytes.
  - sample 2: 265ms, `HIT`, 41,884 bytes.
  - sample 3: 41ms, `HIT`, 41,884 bytes.
- Production HTTP API samples for
  `/api/tier/players?liveOnly=false&_measure=posth2h*`:
  - 3,053ms, 468ms, 459ms.
  - 320 players, decoded response body about 96KB.
- Production browser measurement for `/tier?liveOnly=false` after client data
  render:
  - 320 cards.
  - 320 H2H buttons.
  - 326 total SVGs, including 320 `lucide-plus` icons and 0
    `lucide-circle` / `lucide-check` icons.
  - 320 image elements, 23 completed decoded images near initial viewport.
  - about 6,680 DOM nodes.
  - one `/api/tier/players` resource: about 370ms duration, 18KB transfer,
    96KB decoded body.
- Interpretation:
  - The repeated H2H icon pair reduction landed: full tier SVG count is now
    roughly half of the earlier 646-SVG measurement.
  - The shell path remains cacheable and correctly matched to `/tier`.
  - The next measurable full-tier candidate is the API response path and cache
    behavior, because browser-rendered DOM/SVG cost improved while the
    full-player API still has a visible warm duration.

2026-06-11 tier API duplicate-name payload reduction:

- Re-checked production `/api/tier/players?liveOnly=false` without a
  cache-busting query. The first observed sample was `MISS` at about 3.0s, then
  repeated samples were `HIT` at about 290-354ms with the same 96,419-byte
  decoded body. This confirms the API response is being served from Vercel
  cache after warm-up.
- Measured the duplicate `playerNames` array in that production payload at
  6,316 decoded bytes for 320 players. The same names are already present as
  `players[].name`.
- Removed `playerNames` from the tier API payload and changed `PlayerSearch`
  to derive its existing name-match guard from `players[].name` in the payload
  already loaded by the tier client. This avoids sending the same name list
  twice while keeping the normal client-side invalid-search guard in place.
- Kept visible labels, tier filtering, live filtering, profile links, H2H quick
  add attributes, and cache TTLs unchanged.
- Verification before deploy:
  - `npm.cmd run test:tier-page-cache-contract` failed before each behavior
    slice and passed after implementation.
  - `npm.cmd run test:tier-page-helpers`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`

2026-06-14 player detail-summary API shared cache header:

- Started a separate local branch from `origin/main` to avoid mixing player
  page work into the tier performance branch.
- The expanded player detail report already uses
  `getCachedPlayerDetailSummaryById()` with a 300 second
  `public-player-history` data cache, but `/api/player-detail-summary` did not
  expose a matching HTTP shared-cache policy.
- Added a success-only `Cache-Control` header:
  `s-maxage=300, stale-while-revalidate=31536000`.
- Expected effect: repeated detail-summary expansions can be served at the HTTP
  cache layer for the same player summary while keeping error responses
  uncached and preserving the existing lazy-load behavior.
- Local production verification:
  - `GET /api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`
    returned 200.
  - response `Cache-Control` was
    `s-maxage=300, stale-while-revalidate=31536000`.
  - decoded body was 4,784 bytes in the local sample.
- Verification:
  - RED: `npm.cmd run test:player-page-payload-contract` failed before the
    route exposed the cache header.
  - GREEN: `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-history-artifact-cache-contract`
  - `npm.cmd run test:h2h-route-performance-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`

2026-06-14 public matchup players API shared cache header:

- Continued the player/match fallback HTTP-cache pass on
  `codex/player-page-performance-audit`.
- `/api/players` already reads from `getCachedPlayersList()` and has
  `revalidate = 300`, but the successful JSON response did not expose a
  matching shared-cache policy.
- Added the same success-only `Cache-Control` header used by the player detail
  and H2H API cache pass:
  `s-maxage=300, stale-while-revalidate=31536000`.
- Expected effect: match-page fallback player-list loads can reuse the HTTP
  cache layer when server hydration misses, without changing the server-hydrated
  first paint or any visible labels.
- Local production verification:
  - `GET /api/players` returned 200.
  - response `Cache-Control` was
    `s-maxage=300, stale-while-revalidate=31536000`.
  - decoded body was 44,782 bytes in the local sample.
- Verification:
  - RED: `npm.cmd run test:matchup-page-shell-contract` failed before the
    route exposed the cache header.
  - GREEN: `npm.cmd run test:matchup-page-shell-contract`

2026-06-14 H2H stats API shared cache header:

- Continued the player/H2H HTTP-cache pass on the separate
  `codex/player-page-performance-audit` branch.
- `/api/stats/h2h` already cached ID-based detailed H2H work for 300 seconds
  with the `public-player-history` tag, but successful HTTP responses did not
  expose a matching shared-cache policy.
- Added the same success-only `Cache-Control` header:
  `s-maxage=300, stale-while-revalidate=31536000`.
- Expected effect: repeated canonical-ID H2H lookups can be served at the HTTP
  cache layer while preserving the existing name/ID validation and leaving
  error responses uncached.
- Local production verification:
  - `GET /api/stats/h2h?p1=김윤중&p2=이영한&p1_id=66a8e705-a145-47fb-ac17-015e03a4567b&p2_id=89b827df-7015-481c-a05e-814221b79cd8`
    returned 200.
  - response `Cache-Control` was
    `s-maxage=300, stale-while-revalidate=31536000`.
  - decoded body was 395 bytes in the local sample.
- Verification:
  - RED: `npm.cmd run test:h2h-route-performance-contract` failed before the
    route exposed the cache header.
  - GREEN: `npm.cmd run test:h2h-route-performance-contract`
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-history-artifact-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`

2026-06-14 matchup client shared-cache follow-up:

- After adding shared HTTP cache headers to `/api/player-detail-summary`,
  `/api/players`, and `/api/stats/h2h`, checked the client helper that calls
  the public matchup endpoints.
- `fetchMatchupPlayers()` and the canonical-ID H2H helper still passed
  `{ cache: "no-store" }`, which made those browser fetches less aligned with
  the route-level `s-maxage=300, stale-while-revalidate=31536000` policy.
- Removed the explicit `no-store` option from the public matchup player-list
  fallback and canonical-ID H2H fetch. The fallback still only runs when server
  hydration fails, and H2H still requires both canonical player IDs.
- Expected effect: repeated public matchup fallback/H2H requests can benefit
  from the server/CDN cache policy already added in this branch, without
  changing labels, roster identity rules, or error handling.
- Verification:
  - RED: `npm.cmd run test:matchup-page-shell-contract` failed before the
    player-list fallback stopped forcing `no-store`.
  - RED: `npm.cmd run test:matchup-h2h-fetch-contract` failed before H2H
    stopped forcing `no-store`.
  - GREEN: `npm.cmd run test:matchup-page-shell-contract`
  - GREEN: `npm.cmd run test:matchup-h2h-fetch-contract`

2026-06-14 player/match performance branch local deploy-candidate check:

- Current local branch:
  `codex/player-page-performance-audit`.
- Local commits in the player/match public performance package:
  - `37343b0 Cache player detail summary API`
  - `e21f2a4 Cache H2H stats API responses`
  - `026c7fc Cache public players API responses`
  - `44d41e0 Allow matchup fetches to use shared cache`
- Push/deploy status: pushed to
  `origin/codex/player-page-performance-audit` at
  `4d2b3285ec540867ad42cc8a540560fc70368306`; no manual preview or production
  deploy was run.
- Local verification:
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-history-artifact-cache-contract`
  - `npm.cmd run test:h2h-route-performance-contract`
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npm.cmd run test:matchup-zero-h2h-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`
- Local production smoke with `next start -p 3010`:
  - `/player`: 200, 23,049 bytes.
  - `/match`: 200, 78,042 bytes.
  - `/api/players`: 200,
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`, 44,782
    bytes.
  - `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`:
    200, `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`,
    4,130 bytes.
  - ID-based `/api/stats/h2h` for 김윤중 vs 이영한: 200,
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`, 153
    bytes.

2026-06-14 player/match branch preview smoke after push:

- Checked the pushed branch `codex/player-page-performance-audit`; the local
  worktree was clean and tracking `origin/codex/player-page-performance-audit`.
- Remote branch head was `7c019b410ba826a742bcafab4d4cf42e1054ad51`.
- GitHub status:
  - No pull request exists yet for
    `codex/player-page-performance-audit`.
  - No GitHub Actions runs were listed for this branch.
- Vercel status:
  - Latest selected ready preview:
    `https://nzu-homepage-v2-1ywxb4asl-sanparks-projects.vercel.app`
  - Deployment id: `dpl_A48ZnX7hfkwoRi9LnkLptW7gamKn`
  - Branch alias:
    `https://nzu-homepage-v2-git-codex-player-page-330451-sanparks-projects.vercel.app`
  - Preview Protection blocks unauthenticated direct smoke checks, so preview
    verification used authenticated `vercel curl`.
  - No manual preview deploy, production deploy, or promote command was run.
- Preview smoke results:
  - `/player`: 200, `Content-Length: 23049`,
    `X-Vercel-Cache: PRERENDER`.
  - `/match`: 200, `Content-Length: 78042`,
    `X-Vercel-Cache: PRERENDER`.
  - `/api/players`: 200,
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`,
    `Content-Length: 44782`, `X-Vercel-Cache: HIT` after warm-up.
  - `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`:
    200, but preview response headers showed
    `Cache-Control: public, max-age=0, must-revalidate` and
    `X-Vercel-Cache: MISS`.
  - Canonical-ID `/api/stats/h2h` for the local smoke pair: 200, body returned
    the expected H2H JSON, but preview response headers showed
    `Cache-Control: public, max-age=0, must-revalidate`; repeat GET showed
    `X-Vercel-Cache: HIT`.
- Decision note: do not promote/deploy this player/match cache package to
  production yet without a follow-up decision. The static pages and
  `/api/players` preview behavior match expectations, but the dynamic
  detail-summary and H2H API responses do not preserve the intended
  route-level shared-cache header in preview. Next recommended goal is to
  investigate whether this is Vercel Preview Protection/runtime behavior,
  Next route handling, or a route implementation issue before production
  rollout.

2026-06-14 player/match preview cache-header follow-up:

- Follow-up objective: determine whether the dynamic
  `/api/player-detail-summary` and `/api/stats/h2h` preview headers indicate a
  cache miss/regression or expected Vercel response-header behavior.
- Local route/source evidence:
  - `/api/players` declares `runtime = "nodejs"` and `revalidate = 300` and is
    present in `.next/prerender-manifest.json` with initial
    `cache-control: s-maxage=300, stale-while-revalidate=31536000`.
  - `/api/player-detail-summary` and `/api/stats/h2h` are not present in
    `.next/prerender-manifest.json`; they are Vercel Function responses keyed
    by query parameters.
  - Both dynamic routes still set the intended success-only
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000` in source.
- Platform evidence:
  - Vercel's Cache-Control documentation says Vercel uses `Cache-Control` for
    cache behavior when no targeted CDN header is set, and if only
    `Cache-Control` is used Vercel strips `s-maxage` before sending the final
    response to the client.
  - The same documentation's function-response example shows a function
    response with `Cache-Control: s-maxage=60` producing cache behavior for 60
    seconds while the client-facing header becomes `public, max-age: 0`.
  - Next.js route-handler documentation notes that the default caching for
    `GET` handlers changed from static to dynamic in v15, and route handlers
    can use the same segment config options as pages/layouts.
- Authenticated preview recheck with `vercel curl`:
  - `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`:
    200, `Cache-Control: public, max-age=0, must-revalidate`, `Age: 650`,
    `X-Vercel-Cache: STALE`.
  - Canonical-ID `/api/stats/h2h` for the local smoke pair: 200,
    `Cache-Control: public, max-age=0, must-revalidate`, `Age: 560`,
    `X-Vercel-Cache: STALE`.
- Decision: no code fix is required for this branch before production based on
  the preview header difference alone. The dynamic API responses are being
  cached by Vercel; the visible `Cache-Control` header differs because Vercel
  consumes `s-maxage` for CDN behavior on function responses. Production
  rollout can be considered after the usual PR/preview review, without treating
  the dynamic API header display as a blocker.

2026-06-14 player/match performance PR creation:

- Created PR #15:
  `https://github.com/sanpark9038/nzu-homepage-v2/pull/15`
- Branch/base:
  `codex/player-page-performance-audit` -> `main`.
- PR state after creation:
  - Open, not draft.
  - Mergeable according to GitHub.
  - Vercel status check passed.
  - Vercel Preview Comments check passed.
- Fresh local PR-gate verification before PR creation:
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-history-artifact-cache-contract`
  - `npm.cmd run test:h2h-route-performance-contract`
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npm.cmd run test:matchup-zero-h2h-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`
- Latest inspected PR preview:
  - URL:
    `https://nzu-homepage-v2-evm2jfnsq-sanparks-projects.vercel.app`
  - Deployment id: `dpl_GK6yK14gU1hMQqaVx5LK8bP6k9QB`
  - Status: Ready, target `preview`.
  - Branch alias:
    `https://nzu-homepage-v2-git-codex-player-page-330451-sanparks-projects.vercel.app`
- Authenticated PR preview smoke with `vercel curl`:
  - `/player`: 200, `Content-Length: 23049`,
    `X-Vercel-Cache: PRERENDER`, `X-Nextjs-Stale-Time: 300`.
  - `/match`: 200, `Content-Length: 78042`,
    `X-Vercel-Cache: PRERENDER`, `X-Nextjs-Stale-Time: 300`.
  - `/api/players`: 200,
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`,
    `Content-Length: 44782`, `X-Vercel-Cache: PRERENDER`.
  - `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`:
    first request 200 with `X-Vercel-Cache: MISS`; repeat request 200 with
    `Age: 24`, `X-Vercel-Cache: HIT`.
  - Canonical-ID `/api/stats/h2h` for the local smoke pair: first request 200
    with `X-Vercel-Cache: MISS`; repeat request 200 with `Age: 19`,
    `X-Vercel-Cache: HIT`.
- Deploy note: no production deploy, production promote, or manual production
  measurement was run in this PR-creation step.

2026-06-14 PR #15 final integration gate:

- Rechecked PR #15 after the PR documentation push:
  - PR URL: `https://github.com/sanpark9038/nzu-homepage-v2/pull/15`
  - Head: `9744faa39162f857d49d052a45b954d89cf151f6`
  - Base: `main`
  - State: open, not draft.
  - Mergeability: mergeable according to GitHub.
  - Checks: Vercel passed; Vercel Preview Comments passed.
- Rechecked Vercel project/deployment linkage:
  - GitHub default branch is `main`.
  - Latest production deployment inspected:
    `https://nzu-homepage-v2-lhhkt2gxv-sanparks-projects.vercel.app`
  - Production deployment id: `dpl_4ec2FQTd3zZH6GRVHHrpjK5RKMDF`
  - Production aliases include `https://star-hosaga.com`,
    `https://www.star-hosaga.com`, `https://nzu-homepage-v2.vercel.app`, and
    `https://nzu-homepage-v2-git-main-sanparks-projects.vercel.app`.
- Decision: merging PR #15 into `main` is likely equivalent to starting the
  production rollout path. Do not merge PR #15, promote a preview deployment,
  or run a production deploy command unless the operator explicitly approves
  production rollout for this PR.
- Current state after this gate:
  - PR #15 is ready for operator review.
  - Local worktree was clean before this documentation update.
  - No merge, production deploy, production promote, or production measurement
    was run in this step.

2026-06-14 PR #15 production rollout and measurement:

- Operator approved the production rollout objective:
  "PR #15 production rollout을 승인 기준에 따라 진행하고, production 반영 후
  핵심 public route/API 성능과 캐시 동작을 실측해 active plan에 기록한다."
- Fresh pre-merge verification:
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-history-artifact-cache-contract`
  - `npm.cmd run test:h2h-route-performance-contract`
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npm.cmd run test:matchup-zero-h2h-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`
- Merged PR #15 into `main` with GitHub merge commit
  `d5851a3653951e28e3508a32c4304d4c971d19df`.
- Production deployment:
  - URL:
    `https://nzu-homepage-v2-k1t1o4fxm-sanparks-projects.vercel.app`
  - Deployment id: `dpl_ErKuYreJUKbXpoFcBAsLgVmVJEMN`
  - Target/status: production, Ready.
  - Aliases attached after completion:
    `https://star-hosaga.com`, `https://www.star-hosaga.com`,
    `https://nzu-homepage-v2.vercel.app`,
    `https://nzu-homepage-v2-sanparks-projects.vercel.app`, and
    `https://nzu-homepage-v2-git-main-sanparks-projects.vercel.app`.
- Production measurement notes:
  - Apex `https://star-hosaga.com` redirected with 308 before canonical route
    measurement, so route/API samples below used
    `https://www.star-hosaga.com`.
  - Round 1 was cold/new-deployment observation; round 2 was immediate repeat.
- Production route/API measurements:
  - `/player`: round 1 200, 728ms, 23,049 bytes,
    `X-Vercel-Cache: PRERENDER`; round 2 200, 14ms, 23,049 bytes,
    `X-Vercel-Cache: HIT`.
  - `/match`: round 1 200, 700ms, 78,042 bytes,
    `X-Vercel-Cache: PRERENDER`; round 2 200, 15ms, 78,042 bytes,
    `X-Vercel-Cache: HIT`.
  - `/api/players`: round 1 200, 814ms, 44,782 bytes,
    `Cache-Control: s-maxage=300, stale-while-revalidate=31536000`,
    `X-Vercel-Cache: PRERENDER`; round 2 200, 11ms, 44,782 bytes,
    same cache header, `X-Vercel-Cache: HIT`.
  - `/api/player-detail-summary?id=5aee11bf-9641-4056-8290-8c4cae1efa49`:
    round 1 200, 1,984ms, 4,130 bytes,
    `Cache-Control: public, must-revalidate, max-age=0`,
    `X-Vercel-Cache: MISS`; round 2 200, 8ms, 4,130 bytes,
    same client-facing cache header, `X-Vercel-Cache: HIT`.
  - Canonical-ID `/api/stats/h2h` for the local smoke pair:
    round 1 200, 1,394ms, 347 bytes,
    `Cache-Control: public, must-revalidate, max-age=0`,
    `X-Vercel-Cache: MISS`; round 2 200, 8ms, 347 bytes,
    same client-facing cache header, `X-Vercel-Cache: HIT`.
- Post-deploy error scan:
  - `vercel.cmd logs
    https://nzu-homepage-v2-k1t1o4fxm-sanparks-projects.vercel.app
    --no-follow --since 1h --level error --limit 20`
  - Result: no logs found for the production deployment.

2026-06-14 post-rollout tier next-bottleneck audit:

- Current branch/state before this audit: `main`, clean, tracking
  `origin/main` after production rollout record commit `2a359f7`.
- Goal: identify the next public-page performance target after PR #15 reached
  production, with focus on `/tier?liveOnly=false` and tier API cache behavior.
- Canonical production measurement host:
  `https://www.star-hosaga.com`. The apex host redirects with 308 before route
  measurement, so the canonical `www` host is the stable sample target.
- Production route/API samples:
  - Round 1:
    - `/tier`: 200, 872ms, 41,884 bytes,
      `Cache-Control: public, must-revalidate, max-age=0`,
      `X-Vercel-Cache: PRERENDER`, `X-Matched-Path: /tier`.
    - `/tier?liveOnly=false`: 200, 18ms, 41,884 bytes,
      `Cache-Control: public, must-revalidate, max-age=0`,
      `X-Vercel-Cache: HIT`, `X-Matched-Path: /tier`.
    - `/api/tier/players`: 200, 2,731ms, 38,508 bytes,
      `X-Vercel-Cache: MISS`.
    - `/api/tier/players?liveOnly=false`: 200, 879ms, 91,277 bytes,
      `X-Vercel-Cache: MISS`.
  - Round 2:
    - `/tier`: 200, 205ms, 41,856 bytes, `X-Vercel-Cache: HIT`.
    - `/tier?liveOnly=false`: 200, 10ms, 41,856 bytes,
      `X-Vercel-Cache: HIT`.
    - `/api/tier/players`: 200, 8ms, 38,508 bytes,
      `X-Vercel-Cache: HIT`.
    - `/api/tier/players?liveOnly=false`: 200, 9ms, 91,277 bytes,
      `X-Vercel-Cache: HIT`.
  - Round 3:
    - `/tier`: 200, 24ms, 41,856 bytes, `X-Vercel-Cache: HIT`.
    - `/tier?liveOnly=false`: 200, 12ms, 41,856 bytes,
      `X-Vercel-Cache: HIT`.
    - `/api/tier/players`: 200, 18ms, 38,508 bytes,
      `X-Vercel-Cache: HIT`.
    - `/api/tier/players?liveOnly=false`: 200, 11ms, 91,277 bytes,
      `X-Vercel-Cache: HIT`.
- Interpretation:
  - `/tier?liveOnly=false` is no longer a dynamic/no-store shell bottleneck.
    It now matches `/tier` and gets warm `HIT` behavior.
  - Tier API warm behavior is good once Vercel has a cached response.
  - The remaining measurable tier issue is cold API generation, especially
    live default `/api/tier/players` at 2.7s on the first observed MISS.
  - The client-facing `Cache-Control: public, must-revalidate, max-age=0` on
    function responses is consistent with the earlier Vercel dynamic API
    header investigation; `X-Vercel-Cache` is the cache-behavior signal.
- Payload field contribution sample from production JSON:
  - Live default API: about 44KB decoded JSON for 113 players. Largest repeated
    fields were `broadcast_title`, `live_thumbnail_url`, `id`,
    `channel_profile_image_url`, `name`, `university`, `gender`, `photo_url`,
    `nickname`, `is_live`, `tier`, and `race`.
  - Full API: about 99KB decoded JSON for 320 players. Largest repeated fields
    were `broadcast_title`, `id`, `live_thumbnail_url`,
    `channel_profile_image_url`, `name`, `university`, `gender`, `photo_url`,
    `nickname`, `is_live`, `tier`, and `race`.
- Source evidence:
  - `proxy.ts` no longer rewrites tier query URLs to the dynamic
    `/tier/query` route, so query-bearing tier URLs can reuse the cacheable
    `/tier` shell.
  - `app/api/tier/players/route.ts` uses
    `playerService.getLivePlayers()` for live/default API reads and
    `playerService.getCachedPlayersList()` for `liveOnly=false` reads.
  - `playerService.getLivePlayers()` still performs a direct Supabase
    `players` query filtered by `is_live=true`, while
    `getCachedPlayersList()` uses the `public-players-list-v1` unstable cache
    and then applies the live overlay.
- Next recommended goal:
  1. Investigate and reduce cold latency for live/default
     `/api/tier/players`, starting with `playerService.getLivePlayers()` and
     its cache shape. Candidate directions: derive live players from the
     cached public list when freshness semantics allow it, or add a short
     tagged cache around the live-player query.
  2. Keep `/tier` and `/tier?liveOnly=false` shell routing unchanged unless new
     production evidence shows a regression.
  3. Treat tier API payload splitting as a secondary candidate. The current
     large fields are used by tier cards, quick H2H, profile images, and live
     hover previews, so any payload split needs focused contract coverage
     before removing fields from the main response.

2026-06-14 tier live API cold-cache implementation scope:

- Branch: `codex/tier-live-api-cache`.
- Current local base includes doc commit `ba23519`; this branch has not been
  pushed.
- Objective: reduce cold live/default `/api/tier/players` generation cost
  without changing visible tier labels, route semantics, or push/deploy state.
- TDD target:
  - Add a contract that `playerService.getLivePlayers()` uses a short
    live-player data cache instead of issuing an uncached direct Supabase
    `players` list query on each route regeneration.
  - Keep `/api/tier/players` calling the `getLivePlayers()` service boundary
    so the API route remains small and the cache policy stays in the route.
- Expected verification:
  - `npm.cmd run test:tier-page-cache-contract`
  - `npm.cmd run test:tier-page-helpers`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`

2026-06-14 tier live API cold-cache implementation result:

- Added `fetchCachedLivePlayersForList` in `lib/player-service.ts`:
  - cache key: `public-live-players-list-v1`
  - revalidate: 60 seconds
  - tag: `public-live-players-list`
- `playerService.getLivePlayers()` now calls the short cached helper instead
  of issuing its own direct Supabase `players` query every time the live/default
  tier API regenerates.
- Kept `/api/tier/players` response semantics and cache headers unchanged:
  live/default API remains `s-maxage=10, stale-while-revalidate=60`; full tier
  API remains `s-maxage=300, stale-while-revalidate=31536000`.
- TDD evidence:
  - RED: `npm.cmd run test:tier-page-cache-contract` failed because
    `fetchCachedLivePlayersForList` did not exist and `getLivePlayers()` still
    owned the direct Supabase query.
  - GREEN: same contract passed after the live query moved behind the 60-second
    data cache.
- Verification:
  - `npm.cmd run test:tier-page-cache-contract`
  - `npm.cmd run test:tier-page-helpers`
  - `npm.cmd run test:player-page-payload-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build` with network escalation after the first sandboxed build
    produced Supabase `EACCES` fetch warnings despite exit code 0.
- Push/deploy status: not pushed and not deployed.

2026-06-14 entry page packed hydration payload narrowing:

- Branch: `codex/match-page-performance-audit`.
- Context:
  - After the `/match` hydration narrowing, the local production remeasure
    showed `/entry` as the largest public HTML route in the sampled set at
    79,847 bytes.
  - `/entry` still needs `id`, `name`, `nickname`, `race`, `gender`, `tier`,
    and `university` for the two-sided H2H selector, tier grouping, badges,
    and university filters, so this slice avoids dropping fields.
- TDD evidence:
  - Added an entry route source contract to
    `scripts/tools/matchup-page-shell-contract.test.js` requiring the server
    page to call `packMatchupPlayerSummaries(matchupPlayers)` and hydrate
    `H2HLookup` with `packedPlayers`.
  - Added packed helper coverage to `scripts/tools/matchup-helpers.test.mjs`
    requiring tuple-shaped payloads, exact round-trip unpacking, and smaller
    JSON than repeated object-key summaries.
  - RED:
    - `npm.cmd run test:matchup-page-shell-contract` failed because
      `app/entry/page.tsx` still hydrated `players={matchupPlayers}`.
    - `npm.cmd run test:matchup-helpers` failed because
      `packMatchupPlayerSummary` did not exist.
  - GREEN:
    - Added `PackedMatchupPlayerSummary`, pack/unpack helpers, and list
      helpers in `lib/matchup-helpers.ts`.
    - `app/entry/page.tsx` now packs the server-side matchup summaries before
      hydration.
    - `components/stats/H2HLookup.tsx` accepts `packedPlayers`, unpacks them
      once with `useMemo`, and keeps the existing `players` prop as a
      compatibility fallback.
- Payload rule:
  - Preserve all entry/H2H fields, but send them as a stable tuple:
    `[id, name, nickname, race, gender, tier, university]`.
  - The client immediately unpacks the tuple payload back into
    `MatchupPlayerSummary[]`, so selector behavior and user-visible labels stay
    unchanged.
- Local production measurement:
  - Baseline from the prior post-match remeasure: `/entry` 200, 79,847 bytes.
  - After packed hydration: `/entry` 200, 56,493 bytes,
    `entryContainsPackedPlayers=true`, `entryContainsPlayersKey=false`.
  - Observed HTML reduction: 23,354 bytes.
  - `/match` smoke remained 200, 65,550 bytes.
- Verification:
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-helpers`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npm.cmd run test:matchup-zero-h2h-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - Local production smoke with network escalation:
    `/entry` 200, 56,493 bytes; `/match` 200, 65,550 bytes.
  - `git diff --check`
- Push/deploy status: not pushed and not deployed.
- Next recommended non-deploy candidates:
  1. Inspect the full tier API payload
     `/api/tier/players?liveOnly=false`, which remains around 75KB locally.
  2. Inspect `/rankings` HTML payload, now among the larger public HTML routes
     after `/entry` and `/match` reductions.

2026-06-14 tier API packed payload:

- Branch: `codex/match-page-performance-audit`.
- Context:
  - After `/entry` was reduced, the next non-deploy API candidate was the full
    tier endpoint `/api/tier/players?liveOnly=false`.
  - Field-contribution sampling showed the remaining large bytes were mostly
    required card/filter/H2H fields plus live metadata; removing fields would
    weaken the tier page, while repeated object keys were still avoidable.
- TDD evidence:
  - Added `tier API packed payload preserves fields with smaller JSON` to
    `scripts/tools/tier-page-helpers.test.cjs`.
  - Updated `scripts/tools/tier-page-cache-contract.test.js` so the API route
    must use `buildPackedTierPlayersPayload()` and `TierClientView` must call
    `unpackTierPlayersPayload()`.
  - RED:
    - `npm.cmd run test:tier-page-helpers` failed because
      `buildPackedTierPlayersPayload` did not exist.
    - `npm.cmd run test:tier-page-cache-contract` failed because the tier
      client did not call `unpackTierPlayersPayload`.
  - GREEN:
    - `lib/tier-player-payload.ts` now emits a self-described
      `fields + players(tuple[])` payload and unpacks it back to the existing
      tier player object shape.
    - `app/api/tier/players/route.ts` returns the packed payload.
    - `app/tier/TierClientView.tsx` unpacks immediately after `response.json()`,
      keeping the rest of the card/filter code on object-shaped players.
    - Tier page helpers and tier card props were narrowed to the tier payload
      shape instead of requiring the full `Player` row.
- Payload rule:
  - Core fields remain in every tuple:
    `id`, `name`, `nickname`, `race`, `gender`, `tier`, `university`,
    `is_live`.
  - Optional media/live fields are included in `fields` only when at least one
    row uses them: `broadcast_title`, `channel_profile_image_url`,
    `live_thumbnail_url`, `photo_url`.
  - The client unpacks before rendering, so UI labels and card behavior stay
    unchanged.
- Local production measurement:
  - Pre-change same-server sampling estimated packed full tier payload at about
    42KB versus about 67KB object JSON.
  - After implementation and production build:
    - `/api/tier/players`: 200, 23,166 bytes, 127 players,
      `playersAreArrays=true`.
    - `/api/tier/players?liveOnly=false`: 200, 42,147 bytes, 320 players,
      `playersAreArrays=true`, `firstPlayerHasIdKey=false`.
    - `/tier`: 200, 41,884 bytes.
  - Browser verification on `http://localhost:3023/tier?liveOnly=false`:
    error output empty, no framework overlay, content present, 320 tier H2H
    buttons rendered, and the browser resource entry for
    `/api/tier/players?liveOnly=false` had `encodedBodySize=42147`.
- Verification:
  - `npm.cmd run test:tier-page-helpers`
  - `npm.cmd run test:tier-page-cache-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`
  - `agent-browser.cmd open http://localhost:3023/tier?liveOnly=false`
  - `agent-browser.cmd wait --load networkidle`
  - `agent-browser.cmd errors`
  - `agent-browser.cmd snapshot -i`
- Push/deploy status: not pushed and not deployed.
- Next recommended non-deploy candidate:
  - Re-run the public route/API table after this API packing commit, then
    inspect `/rankings` if it remains one of the larger public HTML routes.

2026-06-14 post-entry-and-tier-packing local production remeasure:

- Branch: `codex/match-page-performance-audit`.
- Method:
  - Used the current production build with local `next start` on port 3024.
  - Sampled two rounds across the public routes/APIs after the `/entry`
    hydration packing and tier API tuple packing commits.
- Selected samples:
  - Round 1:
    - `/tier`: 200, 188ms, 41,884 bytes.
    - `/tier?liveOnly=false`: 200, 22ms, 41,884 bytes.
    - `/api/tier/players`: 200, 346ms, 23,518 bytes.
    - `/api/tier/players?liveOnly=false`: 200, 12ms, 42,147 bytes.
    - `/match`: 200, 14ms, 65,550 bytes.
    - `/api/players`: 200, 7ms, 44,782 bytes.
    - `/entry`: 200, 12ms, 56,493 bytes.
    - `/rankings`: 200, 29ms, 59,195 bytes.
    - `/teams`: 200, 52ms, 50,307 bytes.
    - `/player`: 200, 29ms, 23,049 bytes.
    - `/schedule`: 200, 8ms, 28,360 bytes.
    - `/prediction`: 200, 16ms, 23,597 bytes.
    - `/api/prediction`: 200, 327ms, 52 bytes.
    - `/board`: 200, 18ms, 38,552 bytes.
  - Round 2 warm:
    - `/tier`: 4ms, 41,856 bytes.
    - `/api/tier/players`: 3ms, 23,518 bytes.
    - `/api/tier/players?liveOnly=false`: 4ms, 42,147 bytes.
    - `/match`: 3ms, 65,550 bytes.
    - `/api/players`: 2ms, 44,782 bytes.
    - `/entry`: 4ms, 56,493 bytes.
    - `/rankings`: 3ms, 59,167 bytes.
    - `/teams`: 3ms, 50,279 bytes.
- Interpretation:
  - Full tier API is no longer the largest measured public API payload after
    tuple packing; it is now about 42.1KB locally.
  - The remaining largest public HTML responses are `/match` at 65.5KB,
    `/rankings` at 59.2KB, and `/entry` at 56.5KB.
  - `/api/players` is now about 44.8KB and remains useful as a shared fallback
    payload, but it is smaller than the leading HTML candidates.
- Push/deploy status: not pushed and not deployed.
- Next recommended non-deploy candidate:
  - Inspect `/rankings` hydration/server payload shape, because `/match` has
    already had two recent slices and `/rankings` is now the next untreated
    large public HTML route.

2026-06-14 tier API media payload narrowing:

- Branch: `codex/tier-live-api-cache`.
- Objective: continue the same tier API performance branch by reducing
  repeated media fields in `/api/tier/players`, especially the full
  `liveOnly=false` payload.
- TDD evidence:
  - RED: `npm.cmd run test:tier-page-helpers` failed with
    `Cannot find module ... lib\tier-player-payload.ts` after adding the
    desired `buildTierPlayerPayload` behavior test.
  - GREEN: the same test passed after adding `lib/tier-player-payload.ts` and
    wiring `app/api/tier/players/route.ts` to `players.map(buildTierPlayerPayload)`.
  - Existing source contract initially failed because it still expected the old
    inline route mapper; it now guards the helper boundary and prevents
    reintroducing direct media field mapping in the API route.
- Payload rule:
  - Always keep tier card / H2H / filter identity fields:
    `id`, `name`, `nickname`, `race`, `gender`, `tier`, `university`,
    `is_live`.
  - Include `channel_profile_image_url` only when present.
  - Include `photo_url` only when no channel profile image is present and the
    photo URL is needed as the card fallback.
  - Include `broadcast_title` and `live_thumbnail_url` only for live players
    and only when those values are present.
- Production JSON sample transformed locally with the new payload rule:
  - `/api/tier/players`: 43,601 bytes -> 38,295 bytes, 5,306 bytes saved,
    112 players.
  - `/api/tier/players?liveOnly=false`: 99,118 bytes -> 73,257 bytes,
    25,861 bytes saved, 320 players.
- Push/deploy status: not pushed and not deployed.

2026-06-14 tier API performance branch local deploy-candidate gate:

- Branch: `codex/tier-live-api-cache`.
- Worktree status before gate: clean.
- Base:
  - `main..HEAD`: `63d35a3 Cache live tier player query`,
    `995ef7c Trim tier API media payload`.
  - `origin/main..HEAD`: also includes `ba23519 Record tier next bottleneck
    audit`, because local `main` has that documentation commit ahead of
    `origin/main`.
- Local package contents:
  - `getLivePlayers()` now uses a short 60-second live-player data cache to
    reduce cold/default `/api/tier/players` generation pressure.
  - tier API payload mapping now omits unused null/duplicate media fields while
    preserving tier card profile fallback, live hover metadata, filters, and
    quick H2H identity fields.
- Expected effect before preview/production:
  - Better live/default API cold regeneration behavior after the first live
    query fills the 60-second data cache.
  - Smaller tier API JSON, especially full `liveOnly=false` responses. The
    latest production JSON transformed locally with the branch rule showed
    about 25.9KB saved on the full tier payload.
- Fresh local gate verification:
  - `npm.cmd run test:tier-page-cache-contract`
  - `npm.cmd run test:tier-page-helpers`
  - `npm.cmd run test:player-page-payload-contract`
  - `npm.cmd run test:player-live-overlay`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `git diff --check`
  - `npm.cmd run build`
- Push/deploy status: not pushed, no PR opened, and no preview/production
  deploy run.
- Next operator decision:
  - If approved, push `codex/tier-live-api-cache`, inspect preview, and measure
    preview `/tier`, `/tier?liveOnly=false`, `/api/tier/players`, and
    `/api/tier/players?liveOnly=false` cold/warm behavior before considering
    production rollout.

2026-06-14 tier branch local production route/API remeasure:

- Branch: `codex/tier-live-api-cache`.
- Method:
  - Used the existing production build with local `next start`.
  - First local server attempt under the default sandbox returned 500 for
    `/api/tier/players`; server logs showed Supabase `TypeError: fetch failed`
    with `EACCES`, so that was an environment/network permission artifact, not
    a code result.
  - Re-ran the same local production measurement with network escalation.
- Network-approved local production samples:
  - Round 1:
    - `/tier`: 200, 99ms, 41,856 bytes.
    - `/tier?liveOnly=false`: 200, 165ms, 41,856 bytes.
    - `/api/tier/players`: 200, 1,129ms, 40,465 bytes,
      `s-maxage=10, stale-while-revalidate=60`.
    - `/api/tier/players?liveOnly=false`: 200, 263ms, 53,274 bytes,
      `s-maxage=300, stale-while-revalidate=31536000`.
    - `/player`: 200, 31ms, 23,021 bytes.
    - `/match`: 200, 59ms, 78,014 bytes.
    - `/api/players`: 200, 44ms, 48,106 bytes.
    - `/schedule`: 200, 36ms, 25,056 bytes.
    - `/prediction`: 200, 30ms, 23,569 bytes.
    - `/api/prediction`: 200, 326ms, 52 bytes.
  - Warm rounds:
    - `/api/tier/players`: 27-28ms, 40,465 bytes.
    - `/api/tier/players?liveOnly=false`: 41-42ms, 73,744 bytes.
    - `/tier` and `/tier?liveOnly=false`: 29-34ms, 41,856 bytes.
    - `/match`: 46-55ms, 78,014 bytes.
    - `/api/players`: 30-31ms, 48,106 bytes.
- Interpretation:
  - The live-player short data cache is working locally: the first live API
    request still pays the Supabase/cold fill cost, while immediate warm
    repeats drop to about 27-28ms.
  - The media payload narrowing reduces the full tier API below the latest
    production sample of about 99KB; warm local samples settled at about 73.7KB.
  - `/match` is now the largest measured public HTML response in this local
    set at about 78KB. If the tier branch is held for preview approval, the
    next non-deploy performance investigation should inspect `/match` client
    island/module payload rather than adding more tier changes blindly.
- Push/deploy status: still not pushed and not deployed.

2026-06-14 match page inactive client panel cleanup:

- Branch: `codex/match-page-performance-audit`.
- Context:
  - The latest local production route/API remeasure showed `/match` as the
    largest public HTML response in the sample at about 78KB.
  - Source inspection found a hard-disabled `SHOW_ENTRY_BOARD_PANEL = false`
    path inside `app/match/MatchPageClient.tsx`. Although never rendered, the
    inactive `EntryBoardSidePanel` JSX, its H2H aggregation effect, and
    panel-only lucide icons were still present in the match client module and
    previous `.next` source maps.
- TDD evidence:
  - Added `match client does not ship disabled entry-board panel code` to
    `scripts/tools/matchup-page-shell-contract.test.js`.
  - RED: `npm.cmd run test:matchup-page-shell-contract` failed on the new
    source contract because `SHOW_ENTRY_BOARD_PANEL`, `EntryBoardSidePanel`,
    and panel-only icon references were still present.
  - GREEN: removed the inactive panel, its panel-only helpers, the panel-only
    icon imports, and the dead conditional render sites from
    `app/match/MatchPageClient.tsx`.
- Result:
  - `app/match/MatchPageClient.tsx` changed by about 275 deleted lines with no
    visible `/match` label or active workflow change.
  - Post-build `.next` search found no `Broadcast Side Panel`,
    `EntryBoardSidePanel`, `MonitorUp`, `RadioTower`, `LayoutPanelLeft`,
    `match-live`, or `overlay/entry-board` strings.
  - Local production `/match` smoke returned `200`, 78,042 bytes, and
    `containsEntryBoardPanel=false`. HTML size is effectively unchanged, so
    this slice should be treated as client-module cleanup rather than initial
    HTML payload reduction.
- Verification:
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npm.cmd run test:matchup-helpers`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `git diff --check`
- Push/deploy status: not pushed and not deployed.

2026-06-14 match page initial hydration payload narrowing:

- Branch: `codex/match-page-performance-audit`.
- Objective: reduce `/match` initial HTML hydration bytes without changing the
  shared `/api/players` fallback payload or the `/entry` H2H tool payload.
- TDD evidence:
  - Updated `scripts/tools/matchup-page-shell-contract.test.js` so the match
    route must call `mapPlayersToMatchPageSummaries(players)` and the client
    must receive `MatchPagePlayerSummary[]`.
  - Added `mapPlayersToMatchPageSummaries keeps only fields used by the match
    page` to `scripts/tools/matchup-helpers.test.mjs`.
  - RED:
    - `npm.cmd run test:matchup-page-shell-contract` failed because
      `app/match/page.tsx` still used `mapPlayersToMatchupSummaries(players)`
      and the client still accepted `MatchupPlayerSummary[]`.
    - `npm.cmd run test:matchup-helpers` failed because
      `mapPlayerToMatchPageSummary` did not exist.
  - GREEN:
    - Added `MatchPagePlayerSummary`, `mapPlayerToMatchPageSummary`, and
      `mapPlayersToMatchPageSummaries` in `lib/matchup-helpers.ts`.
    - `app/match/page.tsx` now uses the match-page mapper.
    - `app/match/MatchPageClient.tsx` now types its initial player state as
      `MatchPagePlayerSummary[]`.
    - `filterMatchupPlayers` now accepts either the full shared summary or the
      slimmer match-page summary, preserving `/entry` university filtering and
      `/match` query/exclude filtering.
- Payload rule:
  - `/match` initial hydration keeps only fields used by match search,
    selected-player display, and H2H calls: `id`, `name`, `nickname`, `race`,
    and `gender`.
  - `tier` and `university` remain in the shared `/api/players` fallback/API
    payload for `/entry` and other public H2H tools.
- Local production measurement:
  - Before this slice, after the inactive panel cleanup, `/match` smoke was
    `200`, 78,042 bytes.
  - After the slim hydration mapper, `/match` smoke is `200`, 65,550 bytes,
    with `matchContainsTierKey=false` and `matchContainsUniversityKey=false`.
  - Observed HTML reduction: 12,492 bytes.
  - `/api/players` remains `200`, 48,106 bytes, with `tier` and `university`
    still present.
- Verification:
  - `npm.cmd run test:matchup-page-shell-contract`
  - `npm.cmd run test:matchup-helpers`
  - `npm.cmd run test:matchup-h2h-fetch-contract`
  - `npx.cmd tsc --noEmit --incremental false`
  - `npm.cmd run lint`
  - `npm.cmd run build`
- Push/deploy status: not pushed and not deployed.

2026-06-14 post-match-cleanup local production route/API remeasure:

- Branch: `codex/match-page-performance-audit`.
- Method:
  - Used the current production build with local `next start`.
  - Ran with network escalation so Supabase-backed API routes were measured
    instead of failing under sandbox `EACCES`.
  - Sampled three rounds across public routes and public APIs.
- Selected samples:
  - Round 1:
    - `/tier`: 200, 1,089ms, 41,884 bytes.
    - `/tier?liveOnly=false`: 200, 139ms, 41,884 bytes.
    - `/api/tier/players`: 200, 1,014ms, 40,465 bytes.
    - `/api/tier/players?liveOnly=false`: 200, 61ms, 75,178 bytes.
    - `/match`: 200, 102ms, 65,550 bytes.
    - `/api/players`: 200, 50ms, 48,106 bytes.
    - `/player`: 200, 34ms, 23,049 bytes.
    - `/entry`: 200, 69ms, 79,847 bytes.
    - `/schedule`: 200, 40ms, 28,360 bytes.
    - `/prediction`: 200, 36ms, 23,597 bytes.
    - `/api/prediction`: 200, 274ms, 52 bytes.
    - `/teams`: 200, 62ms, 50,307 bytes.
    - `/rankings`: 200, 56ms, 59,195 bytes.
    - `/board`: 200, 54ms, 38,552 bytes.
  - Warm rounds:
    - `/tier`: 40-47ms, 41,856 bytes.
    - `/api/tier/players`: 32-37ms, 43,054 bytes.
    - `/api/tier/players?liveOnly=false`: 48-55ms, 75,178 bytes.
    - `/match`: 50-52ms, 65,550 bytes.
    - `/api/players`: 82-107ms, 48,106 bytes.
    - `/entry`: 57-58ms, 79,847 bytes.
    - `/rankings`: 44-49ms, 59,167 bytes.
- Interpretation:
  - The `/match` HTML payload reduction is visible in production-mode local
    output: it is now 65.5KB instead of the prior 78KB range.
  - The next largest public HTML route is `/entry` at about 79.8KB.
  - The next largest public API payload remains full
    `/api/tier/players?liveOnly=false` at about 75.2KB.
  - Tier live/default API still has a cold first-fill cost around 1s locally,
    while warm reads are about 32-37ms.
- Next recommended non-deploy candidates:
  1. Inspect `/entry` initial H2H player hydration and bundle shape. Unlike
     `/match`, `/entry` appears to need university and tier for its two-sided
     filters and grouping, so any reduction must preserve that workflow.
  2. Inspect remaining full tier API field contribution after the media
     trimming commit to see whether the 75.2KB payload still has removable
     fields or whether it is now mostly required identity/card data.
  3. Keep push/preview/production rollout as an operator-approved decision;
     this branch is still local only.
- Push/deploy status: not pushed and not deployed.
