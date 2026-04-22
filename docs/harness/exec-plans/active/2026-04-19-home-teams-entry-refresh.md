# ACTIVE PLAN: home-teams-entry-refresh

Created: 2026-04-19
Status: in-progress

## Goal

Align the public site so home stays a lightweight landing page, teams live on `/teams`, and entry/H2H flows use the real matchup data path.

## 작업 전 확인 완료

### 충돌 위험 파일

- `app/page.tsx`
- `app/entry/page.tsx`
- `app/match/page.tsx`
- `lib/navigation-config.ts`
- shared matchup/H2H contract files such as `lib/matchup-helpers.ts`, `lib/player-matchup-summary.ts`, and `app/api/players/route.ts`

### 독립 수정 가능한 파일

- `app/teams/page.tsx` when the change is teams-page-only copy/layout
- `components/home/TournamentTeamsView.tsx` when the change stays home-view-local
- `app/player/PlayerSearchResult.tsx` when the change is limited to player-card rendering and does not alter shared payload shape

### 마지막으로 확인한 기준 시점/근거

- Confirmed from this plan's current `Files in play`, completed steps, and next steps on 2026-04-22.
- Treat any change that touches shared matchup data or public navigation wording as coordinated work, not isolated cleanup.

## Completed steps

- [x] Move team-roster browsing intent off the home page and add a dedicated `/teams` route
- [x] Restore `/entry` as its own page instead of redirecting to `/match`
- [x] Hide `/schedule` from the visible navbar and expose `/entry` and `/teams`
- [x] Update entry matchup rows to use real H2H fetches, recent/overall splits, race badges, and smoother drag reorder behavior
- [x] Replace the old team-heavy home view with a lighter landing page and quick links
- [x] Add a shared matchup helper so `/entry`, `/match`, and future pages can reuse the same H2H request contract and player summary shape
- [x] Move the tier-page `H2HSelectorBar` onto the same shared H2H request path used by `/entry` and `/match`
- [x] Move player-page matchup summary types/builders into a shared helper so player detail can reuse the same internal data contract
- [x] Run targeted route verification for `/entry`, `/match`, `/tier`, and `/player`, and fix the player-page helper-import regression found during the check
- [x] Centralize public matchup-player summary mapping so `/entry`, `/match`, and `/api/players` share the same player payload contract
- [x] Guard `/entry` against nullable tier values, align its cache window with the shared player list, and add helper-contract tests for the shared matchup summary path
- [x] Tighten the shared matchup summary contract so `tier` is always a string, keep runtime fetch noise dev-only, and rerun the shared helper tests after Codex CLI review
- [x] Move tier-page filtering, named tier grouping, and tier navigation setup onto a shared helper so `/tier` follows the same public player-data path without page-local copies
- [x] Align `/tier` filter wording with current product copy and review `/match` momentum detail cards for remaining wiring risks
- [x] Seed `DM` into the shared university dictionary and add admin-managed university metadata for `/tier` and `/entry` list options
- [x] Harden the ops pipeline so scheduled runs attempt post-merge Supabase sync, gate publish on blocking alerts, and surface skipped sync status more clearly

## Next steps

- [ ] Tighten the `/entry` auto-match result row spacing so tier badges hide less of longer player names
- [ ] Verify the refreshed home, teams, and entry flows together with lint and targeted browser checks
- [ ] Decide whether the home landing needs one more content pass before the next commit
- [ ] Confirm `/match` and `/entry` stay visually and data-wise aligned around the same real H2H contract
- [ ] Decide whether to harden `/match` momentum detail cards against stale H2H payloads while a card stays open during player changes
- [ ] Decide whether player detail / tier surfaces should adopt the same shared matchup helper for secondary H2H widgets
- [ ] Decide whether player card, rankings, and battle-grid university labels should also move from static config to the same metadata-backed source
- [ ] Decide whether stale homepage-serving freshness should also appear as an explicit section in the success Discord summary, not only in status/check surfaces

## Blockers

- none

## Session recovery

### First three commands

```powershell
git status --short --branch
git log --oneline -5
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

### Last checked state

- Actions run id: `24618468911` (`SOOP Live Sync`, success, 2026-04-19T01:49:30Z)
- Report artifact: local `tmp/reports/homepage_integrity_report.json`
- git HEAD: `85a5eb7 harness: layer agent docs and tighten pipeline checks`

## Files in play

- `app/page.tsx`
- `app/entry/page.tsx`
- `app/teams/page.tsx`
- `components/home/TournamentTeamsView.tsx`
- `components/stats/H2HLookup.tsx`
- `lib/navigation-config.ts`
- `app/match/page.tsx`
- `app/api/players/route.ts`
- `lib/matchup-helpers.ts`
- `components/players/H2HSelectorBar.tsx`
- `lib/player-matchup-summary.ts`
- `app/player/player-page-view.tsx`
- `app/player/PlayerSearchResult.tsx`

## New failure modes found

- Shared helper extraction can regress client pages when local utility imports are removed but not re-imported from the new helper module
- Shared helper extraction needs a contract test around nullable fields so client pages do not silently drift back to nullable `tier` assumptions
- `/match` momentum detail cards can briefly show stale pair data if the expanded panel stays open while one side changes before the next H2H fetch resolves
