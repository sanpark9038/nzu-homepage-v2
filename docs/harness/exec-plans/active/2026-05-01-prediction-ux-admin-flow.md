# ACTIVE PLAN: prediction-ux-admin-flow

Created: 2026-05-01
Status: in-progress

## Goal

Stabilize the public prediction page before launch by making match setup fast for admins and voting fast, clear, and mobile-friendly for users.

## Basis

- Session entry was rerun on 2026-05-01.
- `main` matches `origin/main`; the only untracked repo file is `public/prediction-layout-preview.html`.
- SOOP Cron verification from `public.soop_live_sync_runs` showed 77 successful `supabase-cron` runs from `2026-05-01T00:00:00+09:00` through `2026-05-01T12:40:00+09:00`, with no gap over 11 minutes.
- Current prediction storage is local JSON:
  - `data/metadata/tournament_prediction_matches.v1.json`
  - `data/metadata/tournament_prediction_votes.v1.json`
- Current admin prediction writes still go through local file mutation, which is not a production-safe Vercel write path.
- Brainstorming preview favored A, the fast betting-board layout, with mobile borrowing the larger match-card rhythm from B.
- 2026-05-05 user approved this direction for implementation: Supabase-backed prediction storage plus desktop betting-board and mobile match-card UX.

## Pre-work Confirmation

### Conflict-Risk Files

- `app/prediction/page.tsx`
- `components/prediction/TournamentPredictionClient.tsx`
- `lib/tournament-prediction.ts`
- `app/api/prediction/route.ts`
- `app/admin/prediction/page.tsx`
- `app/admin/prediction/PredictionMatchAdmin.tsx`
- `app/api/admin/prediction/route.ts`
- `lib/database.types.ts`
- `data/metadata/tournament_prediction_matches.v1.json`
- `data/metadata/tournament_prediction_votes.v1.json`

### Independently Editable Files

- `scripts/sql/create-prediction-tables.sql`
- new focused prediction store/helper files under `lib/`
- new prediction-specific tests under `scripts/tools/`
- this active plan

### Last Basis Used

- Current code inspection on 2026-05-01.
- Preview artifacts:
  - `public/prediction-layout-preview.html`
  - `tmp/brainstorm-prediction-20260501-020041`
  - `tmp/brainstorm-prediction-20260501-020057`

## Design Decision

Use the fast betting-board layout as the desktop default and a match-card rhythm on mobile.

The first production-ready slice should also move prediction match and vote state to Supabase-backed server APIs, with the current JSON files retained only as local fallback and migration seed data. This is necessary because the admin goal is operational, not just visual: a production admin must be able to add, edit, close, reopen, and publish results without writing to the deployed filesystem.

## User Voting Flow

- Preserve the public navigation label `승부예측`.
- Desktop layout:
  - compact betting-board rows grouped by status or date
  - left team button, center match/time/status, right team button
  - visible vote percentage/count after selection or when the match is no longer open
  - expandable match detail for player/MVP prediction
- Mobile layout:
  - one match per card
  - large left/right team buttons
  - status and closing time above the pick controls
  - player/MVP prediction behind an expand control to keep first-tap voting fast
- Status labels:
  - `투표 중`: open and outside the closing-warning window
  - `마감 임박`: open but close time is near
  - `마감`: vote closed and result not public
  - `결과 공개`: result winner is published
- Voting rules:
  - one browser voter id can hold one team pick and one MVP/player pick per match
  - votes are rejected server-side after close
  - selected choices are optimistic in the UI but reconciled from the API response
  - stale/invalid local vote cache must not override server truth

## Admin Management Flow

- `/admin/prediction` should become a dense management surface rather than a large form-only page.
- Admin list rows show match title, teams, start time, close time, status, vote totals, and result state.
- Quick actions:
  - add match
  - edit inline
  - duplicate
  - close now
  - reopen
  - publish result
  - unpublish result
  - delete only while no votes exist, otherwise archive/hide
- Match creation defaults:
  - title auto-fills from selected teams
  - close time defaults to 30 minutes before start
  - status defaults to open once both teams and a start time are present
- Admin APIs must authenticate with the existing admin cookie and fail closed when production Supabase admin env is missing.

## Storage Direction

Create Supabase tables for production writes:

- `prediction_matches`
  - `id`
  - `title`
  - `team_a_code`
  - `team_b_code`
  - `start_at`
  - `close_at`
  - `status`
  - `result_team_code`
  - `result_published_at`
  - `display_order`
  - `created_at`
  - `updated_at`
- `prediction_votes`
  - `id`
  - `voter_id`
  - `match_id`
  - `picked_team_code`
  - `picked_player_id`
  - `change_count`
  - `created_at`
  - `updated_at`

Keep public reads and writes behind Next.js route handlers. Do not expose vote tables for anonymous direct writes.

## Completed Steps

- [x] Re-entered through AGENTS and SESSION_ENTRY.
- [x] Checked git status and recent commits.
- [x] Verified GitHub Actions state.
- [x] Verified SOOP Supabase Cron overnight health.
- [x] Inspected preview artifacts.
- [x] Inspected current prediction public, admin, API, and storage code.
- [x] Drafted this split design/implementation plan.

## Next Steps

- [x] Confirm this design direction before code changes.
- [x] Move `public/prediction-layout-preview.html` out of `public/` before prediction implementation.
- [x] Add `scripts/sql/create-prediction-tables.sql`.
- [x] Add a prediction store module that reads Supabase first and falls back to JSON locally.
- [x] Add status derivation and vote validation tests before implementation.
- [x] Implement admin API storage and close/result actions.
- [x] Rework `/admin/prediction` into the management board.
- [x] Rework `/prediction` into the betting-board/mobile-card hybrid.
- [x] Verify with targeted tests, lint/build, and browser checks on desktop and mobile.

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
- git HEAD: `0892066`
- SOOP Cron table: 77/77 success since `2026-05-01T00:00:00+09:00`, no gap over 11 minutes.
- Preview moved out of `public/` and kept as ignored local reference: `tmp/prediction-layout-preview.html`

## Files In Play

- `docs/harness/exec-plans/active/2026-05-01-prediction-ux-admin-flow.md`
- `public/prediction-layout-preview.html`
- `app/prediction/page.tsx`
- `components/prediction/TournamentPredictionClient.tsx`
- `lib/tournament-prediction.ts`
- `app/api/prediction/route.ts`
- `app/admin/prediction/page.tsx`
- `app/admin/prediction/PredictionMatchAdmin.tsx`
- `app/api/admin/prediction/route.ts`
- `scripts/sql/create-prediction-tables.sql`

## New Failure Modes Found

- Production admin prediction writes can appear available while still depending on local JSON writes. The implementation should fail closed or use Supabase-backed storage before launch.

## 2026-05-05 Implementation Slice Result

### Completed

- Added Supabase schema file for `prediction_matches` and `prediction_votes`.
- Added `lib/prediction-store.ts` for Supabase-first reads, local JSON fallback, write guardrails, status derivation, and vote validation.
- Updated public and admin prediction APIs to use the prediction store.
- Updated `/prediction` to reconcile local vote cache against server match truth and show vote percentages only after a pick or closure.
- Reworked `/admin/prediction` into a dense board with add, duplicate, close, reopen, publish A/B, unpublish, archive, and save actions.
- Moved `public/prediction-layout-preview.html` to ignored local reference `tmp/prediction-layout-preview.html`.

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on `http://localhost:3000/prediction`: content rendered, no Next.js overlay, no console errors.
- Browser check on authenticated `http://localhost:3000/admin/prediction`: management board rendered, no Next.js overlay, no console errors.

## 2026-05-05 Login And Roster UX Slice

### User Decision

- Keep the desktop prediction page on the A-style fast betting board.
- Keep mobile closer to the B-style match-card rhythm.
- Show vote rate and remaining time inside the A-style board.
- Require a signed public login session before accepting votes.
- Make admin match setup include fast per-team player roster selection.

### Completed

- Prediction votes now derive `voter_id` from the signed public auth session instead of accepting browser-generated voter ids from the client.
- Unauthenticated users can still view matches, remaining time, and vote totals, but POST voting returns `prediction_login_required`.
- Added `team_a_player_ids` and `team_b_player_ids` to the Supabase SQL, database types, store normalization, and match snapshot builder.
- Admin match rows now show selectable player lists under each team selector and save selected rosters with each match.
- Public MVP/player candidates now come from the admin-selected roster when present, falling back to the team roster otherwise.
- Desktop public prediction rows were tightened into a board-like layout while preserving the larger mobile card rhythm.
- Prediction public/admin copy with prior mojibake was rewritten to normal Korean for the touched screens.
- The shared navbar now hides the full center nav on small screens so the mobile prediction cards do not start under overlapping navigation labels.

### Verification Added

- `scripts/tools/prediction-store-contract.test.mjs` now covers public-session voter ids, selected roster SQL columns, selected roster vote validation, and selected roster match snapshots.

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Unauthenticated `POST /api/prediction` returned `401`.
- Browser check on `http://localhost:3000/prediction`: content rendered, login-only voting prompt visible, team buttons disabled while unauthenticated, no console errors.
- Browser check on mobile viewport `390x844`: prediction cards rendered without navbar label overlap.
- Browser check on authenticated `http://localhost:3000/admin/prediction`: selectable team player lists rendered under each team selector, no console errors.

## 2026-05-05 Winner-Only Admin UX Slice

### User Decisions

- Keep the prediction product simple for now: only winner prediction.
- Team matches predict the final winning team only.
- Team entry matchups are informational only and use `매치1`, `매치2`, etc. because order may be unknown.
- Individual matches are separate winner predictions with an admin-editable title such as `중장전 1경기`.
- Team setup can use either direct event teams or existing teams.
- Direct event teams are one-off teams for the event and do not alter official homepage affiliation.
- Same player may appear only once within the same prediction. This blocks duplicates inside A team, inside B team, and across A/B.
- Users may change an existing prediction exactly once before close.
- Published results should let users see whether their own final-winner prediction was correct.

### Completed

- Reworked `/admin/prediction` into a Korean dark-theme management and edit surface.
- Added direct event team inputs, existing team selection, player search, race/tier badges, entry matchup guidance, status filters, duplicate, hide, close, and result publish controls.
- Reworked `/prediction` to remove MVP/player voting from the public UX and focus on final winner selection.
- Added centered team/individual badges, remaining-time/status display, vote percentages, result correctness messaging, and centered entry matchup rows.
- Narrowed public prediction POST handling to final winner picks only.
- Preserved Supabase vote table compatibility while no longer exposing player/MVP voting in the public UI.
- Kept duplicate player validation in both admin client save flow and server-side prediction store validation.

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on desktop `http://localhost:3000/prediction`: content rendered, no Next.js overlay, no console errors.
- Browser check on mobile `390x844` `http://localhost:3000/prediction`: content rendered, no horizontal overflow, no Next.js overlay, no console errors.
- Browser check on authenticated `http://localhost:3000/admin/prediction`: management/edit surface rendered, no Next.js overlay, no console errors.

## 2026-05-05 Delete And Voter Identity Slice

### User Decisions

- Admin deletion should physically remove a prediction from storage, not merely archive it.
- Predictions that already have votes should not be physically deleted; use `숨기기` for those to preserve user vote/result history.
- For prize or follow-up operations, admin needs to see the SOOP fixed login ID and visible nickname for voters.
- Voter identity must remain admin-only and must not be exposed by the public prediction API.

### Completed

- Added `DELETE /api/admin/prediction` for physical match deletion.
- Added store-side deletion guard:
  - delete is allowed when the prediction exists and has no votes
  - delete is blocked with `prediction_delete_has_votes` when votes exist
- Added voter identity fields to `prediction_votes` SQL and database types:
  - `voter_provider`
  - `voter_provider_user_id`
  - `voter_display_name`
  - `voter_avatar_url`
- Updated prediction vote writes to persist SOOP fixed ID and display nickname from the signed public login session.
- Updated admin API responses to include votes for admin-only display.
- Updated `/admin/prediction` to show:
  - `삭제` in each prediction row
  - `완전 삭제` in the selected prediction side panel
  - `투표자 확인` with nickname, fixed ID, pick, and result status

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on authenticated `http://localhost:3000/admin/prediction`: delete buttons and voter identity panel rendered, no Next.js overlay, no console errors.

## 2026-05-05 Admin Voter Detail UX Slice

### User Decisions

- Admin needs the SOOP fixed login ID to send follow-up SOOP messages or gifts outside this homepage.
- The compact side panel is not enough for 200-300 voters.
- Passwords must never be visible to admin and must not be stored or handled by the prediction feature.

### Completed

- Added `lib/prediction-admin-voters.ts` for admin-only voter row helpers:
  - SOOP fixed ID extraction
  - display nickname fallback
  - pick labels
  - pending/correct/wrong result labels
  - vote summary counts
  - search/filter/pagination
  - CSV export
- Replaced the cramped voter side panel with a summary card and a `투표자 상세 보기` modal.
- The modal supports:
  - nickname or SOOP fixed ID search
  - filters for all, A pick, B pick, correct, and wrong
  - 50-row pagination for large vote counts
  - CSV download for external prize/message workflows
  - copy buttons for SOOP fixed IDs

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser check on authenticated `http://localhost:3000/admin/prediction`: voter summary card and voter detail modal rendered, no console errors.

## 2026-05-06 Re-entry And Commit Prep Slice

### Completed

- Re-ran `SESSION_ENTRY.md` orient commands and reopened this active plan.
- Confirmed `public/prediction-layout-preview.html` is not present and not tracked; the local reference remains under `tmp/prediction-layout-preview.html`.
- Audited public/admin prediction API boundaries:
  - public `/api/prediction` returns match snapshots, current-session display info, and the current user's pick summary only
  - admin `/api/admin/prediction` is the only route returning raw vote rows with SOOP fixed IDs and nicknames
- Added a prediction contract test proving public payload helpers do not serialize `voter_id`, `voter_provider_user_id`, display nickname, or avatar URL from stored vote rows.
- Fixed admin player search inputs so the displayed text syncs when the selected player changes externally.

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser smoke on `http://localhost:3000/prediction`: content rendered, no framework error overlay, no console errors.
- Browser smoke on `http://localhost:3000/admin/prediction`: unauthenticated session redirected to `/admin/login?next=%2Fadmin%2Fprediction`, with no framework error overlay or console errors.

### Remaining Before Commit

- Stage only the prediction UX/admin-flow files and keep `public/prediction-layout-preview.html` out of the commit.
- Supabase schema/env follow-up is captured in the next slice.

## 2026-05-06 Supabase Apply And E2E Smoke Slice

### Completed

- Applied `scripts/sql/create-prediction-tables.sql` to the linked Supabase project `ttglvnnzssaaypmcrmdt` using `npx supabase db query --linked`.
- Verified `prediction_matches` and `prediction_votes` tables, columns, indexes/RLS SQL contract, and production env variable names.
- Found and fixed a remote-empty-state mismatch:
  - before: an explicitly empty remote prediction state could still render local JSON demo matches
  - after: an explicitly provided empty state renders no matches, preventing users from seeing matches that POST cannot write to
- Added a regression test for the empty remote state behavior.
- Ran local API smoke through Next dev:
  - admin session issued through `/api/admin/session`
  - temporary prediction created through `/api/admin/prediction`
  - public `/api/prediction` returned the temporary match without voter identity fields
  - temporary prediction deleted through `/api/admin/prediction`
  - remote prediction table counts returned to zero
  - unauthenticated public vote POST returned `401`
- Verified SOOP login start endpoint redirects to `openapi.sooplive.com`.

### Verification

- `npm.cmd run test:prediction-store-contract`
- `npm.cmd run test:prediction-cache-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Supabase row-count check after smoke: `prediction_matches = 0`, `prediction_votes = 0`.

### Remaining Before Public Launch

- Create real prediction matches in `/admin/prediction`; the production prediction tables are intentionally empty after smoke cleanup.
- Complete a human-in-the-loop SOOP login callback test in a real browser session, because external SOOP account authorization cannot be completed by the agent without user credentials.

## 2026-05-11 Prelaunch Ops Re-entry

### Completed

- Re-entered through `AGENTS.md` and `docs/harness/SESSION_ENTRY.md`.
- Confirmed `main` matches `origin/main` at `f314758`.
- Confirmed the latest eight `NZU Ops Pipeline` runs listed by GitHub Actions were successful.
- Ran `npm.cmd run build` successfully.
- Started local production server through `next start`; `/prediction` returned HTTP 200.
- Confirmed `/admin/prediction` renders under an admin session with no browser console errors.
- Verified production SOOP OAuth start redirects to `openapi.sooplive.com`, uses `https://nzu-homepage-v2.vercel.app/api/auth/soop/callback`, and preserves `next=/prediction` in state.
- Completed the human-in-the-loop production SOOP OAuth callback check:
  - the browser returned to `https://nzu-homepage-v2.vercel.app/prediction`
  - `/api/auth/session` returned `ok: true`, `hasSession: true`, and `provider: "soop"`
  - no browser console errors were reported after callback

### Local Test Note

- Local `next start` runs with production-mode secure cookies on plain `http://localhost`.
- Admin and SOOP full cookie-persistence tests should use the HTTPS production domain, or an explicit local cookie workaround when the goal is only UI smoke testing.

### Remaining Before Public Launch

- Create the real prediction match or matches after the exact fixture details are confirmed.

## 2026-05-12 Production Launch Handoff Check

### Completed

- Re-entered through `AGENTS.md` and `docs/harness/SESSION_ENTRY.md`.
- Confirmed `main` matches `origin/main` at `68e3441`.
- Confirmed the latest eight `NZU Ops Pipeline` runs listed by GitHub Actions were successful.
- Checked production `/prediction` at `https://nzu-homepage-v2.vercel.app/prediction`.
- Production public page renders one open team prediction:
  - title: `새 팀전 예측`
  - start: `2026-05-12T20:00:00+09:00`
  - lock: `2026-05-12T19:30:00+09:00`
  - current vote display: A팀 `100% · 1표`, B팀 `0% · 0표`
  - entry order: `경기 순서 확정`
  - entry rows: `매치1` through `매치5`
- Verified production public matchup details start collapsed with `상세보기`, expand to show the five matchup rows, and collapse back to `상세보기`.
- Verified production `/prediction` showed no browser console errors during the public smoke.
- Checked production `/admin/prediction`; unauthenticated access redirects to `/admin/login?next=%2Fadmin%2Fprediction` and shows the admin password form without browser console errors.

### Blocked / Human-In-The-Loop

- Production admin match correction, `순서 미정` / `순서 확정` choice, `임시저장`, and `투표 시작` require the operator to log in directly.
- SOOP logged-in real vote smoke requires an operator SOOP session and an explicit real vote choice.

### Immediate Next Step

- Operator logs into production `/admin/prediction`, confirms or edits the real match data, selects `순서 미정` or `순서 확정`, then uses `임시저장` or `투표 시작`.
- After that, re-check production `/prediction` and complete a SOOP logged-in vote smoke.

## 2026-05-12 Public Matchup Toggle And Admin Order Status Follow-up

### Completed

- Public `/prediction` now keeps team entry matchup details collapsed by default.
- Added a `상세보기` / `접기` arrow toggle with `aria-expanded` and `aria-controls` so users can open matchup details only when they want them.
- Replaced the admin `순서 미정/확정 전환` toggle with explicit `순서 미정` and `순서 확정` controls.
- Kept the existing `entry_order_status` data shape unchanged.
- Added UI contract coverage for the public matchup toggle and the explicit admin order-status controls.

### Verification

- `node scripts\tools\prediction-public-entry-matchup-toggle-ui-contract.test.js`
- `node scripts\tools\prediction-admin-entry-matchup-ui-contract.test.js`
- `node scripts\tools\prediction-public-vote-confirm-ui-contract.test.js`
- `node scripts\tools\prediction-admin-player-search-ui-contract.test.js`
- `npm.cmd run test:prediction-cache-contract`
- `npm.cmd run test:prediction-store-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser smoke on `http://localhost:3000/prediction`: `상세보기` started collapsed, expanded to show matchup rows, and returned to collapsed with `접기`.
- Browser smoke on `http://localhost:3000/admin/prediction`: `순서 미정` and `순서 확정` rendered as explicit controls; selecting `순서 미정` updated the local status badge to `경기 순서 미정`; no browser errors were reported.

## 2026-05-12 Admin Entry Matchup UI Follow-up

### Completed

- Reworked the admin `엔트리 매치업 안내` rows into a larger card-like grid so the matchup controls are easier to read.
- Scoped the A-side matchup dropdown to the players already added to A팀.
- Scoped the B-side matchup dropdown to the players already added to B팀.
- Kept the existing `entry_matchups`, `player_a_id`, and `player_b_id` data shape unchanged.
- Added an admin UI contract test for the team-scoped entry matchup dropdown behavior.

### Verification

- `node scripts\tools\prediction-admin-entry-matchup-ui-contract.test.js`
- `node scripts\tools\prediction-admin-player-search-ui-contract.test.js`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser smoke on `http://localhost:3000/admin/prediction`: A/B entry matchup dropdowns showed only each side's configured team players, selecting values updated the displayed player metadata, and no browser errors were reported.

## 2026-05-19 Existing-Team Source Correction

### Completed

- Changed `/admin/prediction` existing-team options to use player `university` affiliations instead of the temporary tournament home team slots.
- Changed public prediction snapshots to resolve those university-affiliation team codes while retaining the previous temporary tournament team codes as fallback.
- Changed admin existing-team option display names to reuse the same university metadata labels as the entry page.
- Excluded blank and free-agent affiliations from those existing-team options.
- Kept direct event teams separate from official affiliation teams.

### Verification

- `node scripts\tools\prediction-admin-university-teams.test.mjs`
- `npm.cmd run test:prediction-cache-contract`
- `npm.cmd run test:prediction-store-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`

## 2026-05-11 Prediction UI Friction Follow-up

### Completed

- Replaced the native admin player `datalist` picker with a bounded custom combobox/listbox search.
- Limited admin player search results to eight visible matches and included player name, race, and tier metadata in each option.
- Added keyboard navigation and stale-text reset behavior so unmatched typed text does not silently diverge from the selected player.
- Added a public vote confirmation dialog before submitting a team prediction.
- Added focus and Escape-key handling for the confirmation dialog.
- Avoided a production hydration mismatch by rendering stable status labels before the client-side countdown starts.

### Verification

- `node scripts\tools\prediction-admin-player-search-ui-contract.test.js`
- `node scripts\tools\prediction-public-vote-confirm-ui-contract.test.js`
- `npm.cmd run test:prediction-cache-contract`
- `npm.cmd run test:prediction-store-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- Browser smoke on `http://localhost:3000/admin/prediction`: typing `김` in a player search field opened an eight-result custom listbox and reported no browser errors.
- Browser smoke on `http://localhost:3000/prediction`: selecting `B팀 승리` opened the confirmation dialog, `취소` closed it without submitting, and a fresh browser session reported no browser errors.

### Remaining Before Public Launch

- Create the real prediction match or matches after the exact fixture details are confirmed.
