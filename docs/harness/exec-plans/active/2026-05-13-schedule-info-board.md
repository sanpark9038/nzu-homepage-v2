# ACTIVE PLAN: schedule-info-board

Created: 2026-05-13
Status: completed

## Goal

Build the `정보/일정` schedule-board MVP from the approved design:

- administrator-only schedule writing
- board post as source of truth
- `/schedule` today-first list with inline details
- no production DB writes during implementation

## Basis

- User approved the simplified direction on 2026-05-13:
  - one prefix: `정보/일정`
  - date and display name required
  - start time optional
  - end time excluded
  - body reused for board detail and schedule inline detail
  - admin-only schedule writing
- Design document:
  - `docs/superpowers/specs/2026-05-13-schedule-info-board-design.md`
- Implementation plan:
  - `docs/superpowers/plans/2026-05-13-schedule-info-board-implementation.md`

## RB Criteria

- Do not apply production SQL or write production data.
- Preserve locked labels unless the user explicitly changes the wording.
- 2026-05-14 user-approved exception: `/schedule` is now visible as `일정`, replacing the former hidden `대회일정` utility label.
- Public users must not be able to create `정보/일정` posts.
- Public `/schedule` must fail softly with an empty state if the new nullable schedule columns are not migrated yet.
- Use TDD for each implementation slice.
- Verification order:
  1. focused tests
  2. `npm.cmd run pipeline:health`
  3. `npm.cmd run verify:predeploy` if needed and focused checks pass

## Pre-work Confirmation

### Conflict-Risk Files

- `lib/board.ts`
- `lib/database.types.ts`
- `scripts/sql/create-board-posts.sql`
- `app/schedule/page.tsx`
- `app/board/page.tsx`
- `app/board/[id]/page.tsx`
- `components/admin/AdminNav.tsx`
- `package.json`

### Independently Editable Files

- `scripts/tools/schedule-info-board-contract.test.js`
- `scripts/tools/schedule-info-page-contract.test.js`
- `app/api/admin/schedule/route.ts`
- `app/api/admin/schedule/[id]/route.ts`
- `app/admin/schedule/page.tsx`
- `components/admin/schedule/SchedulePostComposer.tsx`
- `components/schedule/ScheduleInfoList.tsx`

### Last Basis Used

- Code inspection on 2026-05-13 after design commit `1439b64`.
- Current worktree was clean before writing this plan.

## Implementation Tasks

- [x] Task 1: Schema and contract red/green.
- [x] Task 2: Board helpers and admin schedule API.
- [x] Task 3: Admin schedule composer and nav.
- [x] Task 4: Public schedule page from board posts.
- [x] Task 5: Board detail external link support.
- [x] Task 6: Verification and documentation.

## Review Checkpoint

2026-05-13 read-only subagent plan review raised four gaps before implementation:

- admin-authenticated image upload was missing
- admin edit/unpublish/delete UI and unpublished admin listing were missing
- quick date filters on `/schedule` were underspecified
- invalid external links and R2 image cleanup needed explicit tests

Resolution in the implementation plan:

- `app/api/board/images/route.ts` will accept admin sessions as an alternate upload identity.
- admin schedule APIs will support all schedule rows for admin listing and clean R2 images on update/delete.
- `SchedulePostComposer` will include create/edit/publish toggle/delete/image upload controls.
- public `ScheduleInfoList` will include `전체`, `오늘`, `내일`, `7일` filters while still listing from today forward by default.
- schedule validation will reject non-empty invalid `external_link_url` values instead of silently dropping them.
- existing generic board edit/delete routes will revalidate `/schedule` for `category = "schedule"` posts.

## Verification Targets

- `npm.cmd run test:schedule-info-board-contract`
- `npm.cmd run test:schedule-info-page-contract`
- `npm.cmd run test:schedule-page-data-source-contract`
- `npm.cmd run test:board-write-contract`
- `npm.cmd run test:board-edit-contract`
- `npm.cmd run test:board-readability-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd run pipeline:health`
- `npm.cmd run verify:predeploy`

## Verification Evidence

2026-05-13 implementation verification:

- PASS: `npm.cmd run test:schedule-info-board-contract`
- PASS: `npm.cmd run test:schedule-info-page-contract`
- PASS: `npm.cmd run test:schedule-page-data-source-contract`
- PASS: `npm.cmd run test:board-write-contract`
- PASS: `npm.cmd run test:board-edit-contract`
- PASS: `npm.cmd run test:board-readability-contract`
- PASS: `npx.cmd tsc --noEmit`
- PASS: `npm.cmd run build`
- PASS: `npm.cmd run lint`
- PASS: `npm.cmd run pipeline:health`
- PASS: `npm.cmd run verify:predeploy`

Browser verification:

- `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000` could not start because an existing `.next/dev/lock` was present; no existing process was killed for this check.
- Used the verified build with `npm.cmd run start -- --hostname 127.0.0.1 --port 3000`.
- PASS: `/schedule` loaded with content and no framework error overlay.
- PASS: `/schedule` empty state displayed `예정된 경기가 없습니다.`
- PASS: `/schedule` had no horizontal overflow at 390x844 or 1440x1000.
- PASS: `/admin/schedule` redirected to `/admin/login?next=%2Fadmin%2Fschedule` when logged out.
- PASS: `agent-browser.cmd errors` returned no browser errors during checks.

## Production Safety

The implementation may add SQL files and type definitions, but it must not apply database changes to production.

Production DB migration is a later explicit approval step.

Before that migration, schedule reads must handle missing schedule columns as "storage not ready" instead of crashing the public page.

## Production Migration Approval Checklist

Do not run this checklist without an explicit user approval for production schema changes.

Scope to approve:

- Apply only the additive schedule fields and index from `scripts/sql/create-board-posts.sql`:
  - `board_posts.schedule_date`
  - `board_posts.schedule_start_time`
  - `board_posts.schedule_display_name`
  - `board_posts_schedule_public_idx`
- Do not insert, update, delete, or backfill production board rows during the migration approval step.
- Do not change RLS, auth policy, or admin credentials in the same step.

Preflight before production schema apply:

- Confirm `main` is pushed and clean.
- Confirm local focused tests still pass:
  - `npm.cmd run test:schedule-info-board-contract`
  - `npm.cmd run test:schedule-info-page-contract`
  - `npm.cmd run test:schedule-page-data-source-contract`
- Confirm `npm.cmd run pipeline:health` passes.
- Confirm `/schedule` still fails softly with the normal empty state if schedule columns are unavailable.

Post-apply verification:

- Open `/schedule` and confirm no crash.
- Open `/admin/schedule` as admin and create one test unpublished schedule post first.
- Publish that schedule post only after confirming board detail and `/schedule` render correctly.
- Confirm `agent-browser.cmd errors` is empty.
- Record the exact command/tool used for the production schema apply in this active plan.

## Current State

- Implementation complete and committed.
- Production schedule schema SQL has been applied for the approved additive columns/index only.
- Production schedule data now contains one approved temporary public test schedule row.
- Public `/schedule` still has the soft-fail guard for non-migrated environments.
- Deployed admin schedule writes can now use the schedule columns, but production schedule data insert/update/delete still requires a separate explicit approval.

## 2026-05-14 Production Schema Migration

User approval:

- `production schedule schema migration 승인. schedule columns/index만 적용해줘`

Preflight verification:

- PASS: `git status --short --branch` showed `main...origin/main`.
- PASS: `git log --oneline -3` showed HEAD `1d3bf2c Record schedule handoff`.
- PASS: `npm.cmd run test:schedule-info-board-contract`.
- PASS: `npm.cmd run test:schedule-info-page-contract`.
- PASS: `npm.cmd run test:schedule-page-data-source-contract`.
- PASS: `npm.cmd run pipeline:health`.

SQL-capable path:

- Used existing linked Supabase workdir `C:\tmp\nzu-supabase-link`.
- Verified project ref `ttglvnnzssaaypmcrmdt`.
- Initial read-only schema check returned no schedule columns/index.

Exact production schema apply command/tool:

```powershell
npx.cmd supabase db query --linked --workdir 'C:\tmp\nzu-supabase-link' --output json "alter table public.board_posts add column if not exists schedule_date date null; alter table public.board_posts add column if not exists schedule_start_time time without time zone null; alter table public.board_posts add column if not exists schedule_display_name text null; create index if not exists board_posts_schedule_public_idx on public.board_posts (published, category, schedule_date, schedule_start_time, created_at);"
```

Applied scope:

- `board_posts.schedule_date`
- `board_posts.schedule_start_time`
- `board_posts.schedule_display_name`
- `board_posts_schedule_public_idx`

Explicitly not performed:

- No production schedule row insert/update/delete.
- No production board row backfill.
- No RLS, auth policy, admin credential, or data pipeline change.

Post-apply verification:

- PASS: read-only schema verification found all three schedule columns and `board_posts_schedule_public_idx`.
- PASS: public production alias `https://nzu-homepage-v2.vercel.app/schedule` loaded.
- PASS: `agent-browser.cmd errors` returned no browser errors.
- Deferred by user constraint: creating a test unpublished schedule post was not performed because production data insert/update/delete still needs separate approval.

## 2026-05-14 Production External Link Schema Follow-Up

User approval:

- `production board_posts.external_link_url nullable column 추가 승인. 데이터 insert/update/delete 없이 컬럼만 추가해줘`

Why this follow-up was needed:

- The approved production schedule columns/index were present.
- The deployed admin schedule API also writes `external_link_url`.
- A production unpublished schedule test create attempt failed before row creation with `503 board_posts storage is not ready`.
- Root-cause check showed `board_posts.external_link_url` was absent from production while the schedule columns were present.
- Read-only verification confirmed the failed test create left `0` matching test rows behind.

Exact production schema apply command/tool:

```powershell
npx.cmd supabase db query --linked --workdir 'C:\tmp\nzu-supabase-link' --output json "alter table public.board_posts add column if not exists external_link_url text null;"
```

Applied scope:

- `board_posts.external_link_url`

Explicitly not performed:

- No production schedule row insert/update/delete.
- No production board row backfill.
- No RLS, auth policy, admin credential, or data pipeline change.

Post-apply verification:

- PASS: read-only SQL schema verification found `external_link_url` with `data_type = text` and `is_nullable = YES`.
- PASS: Supabase REST query `select=id,external_link_url&limit=1` returned `200`.
- Production unpublished schedule write-path test remains paused until separately resumed after this schema-only follow-up.

## 2026-05-14 Production Unpublished Schedule Smoke Test

User approval:

- `production 비공개 테스트 일정 글 1개 생성/확인/삭제 승인. 공개 publish는 하지 마.`
- After the `external_link_url` schema follow-up, user said to proceed with the paused test.

Test route:

- Used deployed production admin APIs at `https://nzu-homepage-v2.vercel.app`.
- Authenticated through `/api/admin/session` using the configured admin access key.
- Created one schedule post with `published: false`.
- Did not publish any production schedule.

Test row:

- Marker: `codex-schedule-smoke-1778733623670`
- Created id: `e52ba655-b91a-439b-adf6-893df536e097`
- Schedule date: `2026-05-15`

Verification:

- PASS: `POST /api/admin/schedule` returned `201`.
- PASS: returned row had `category = "schedule"` and `published = false`.
- PASS: `GET /api/admin/schedule` found the unpublished row before deletion.
- PASS: public `GET /schedule` returned `200` and did not contain the test marker.
- PASS: `DELETE /api/admin/schedule/e52ba655-b91a-439b-adf6-893df536e097` returned `200`.
- PASS: `GET /api/admin/schedule` no longer found the row after deletion.
- PASS: read-only SQL residue check returned `matching_test_rows = 0` for the test id/marker.

Final production data state:

- The only production data write was the approved temporary unpublished test row.
- The test row was deleted during the same smoke test.
- No matching test row remains.

## 2026-05-14 Temporary Public Schedule Test Row

User request:

- User asked Codex to set temporary values and register a production schedule for testing, noting that it can be deleted later.

Created production row:

- id: `79fc792d-eee5-4a30-8c1f-2a8d7727fac5`
- marker: `codex-public-schedule-test-1778733883558`
- title: `[TEST] Schedule smoke check - codex-public-schedule-test-1778733883558`
- display name: `TEST Schedule`
- schedule date: `2026-05-15`
- schedule start time: `09:00`
- published: `true`

Verification:

- PASS: `POST /api/admin/schedule` returned `201`.
- PASS: `GET /api/admin/schedule` found the row.
- PASS: public `GET /schedule` contained the marker.
- PASS: browser `/schedule` loaded with no browser errors.
- PASS: after selecting the `내일` filter, browser DOM contained both the marker and `[TEST] Schedule smoke check`.
- PASS: read-only SQL check found the row with `published = true`, `schedule_date = 2026-05-15`, and corrected ASCII test copy.

Notes:

- The first create request used Korean test literals that were mangled by the Windows PowerShell command boundary before reaching Node.
- Codex immediately patched only this test row to ASCII test copy to avoid leaving garbled public text.
- This temporary public row intentionally remains in production for review.
- Delete when the test is no longer needed:

```text
DELETE /api/admin/schedule/79fc792d-eee5-4a30-8c1f-2a8d7727fac5
```

## 2026-05-14 UI Refinement Scope

User-approved refinement:

- Promote `/schedule` into the visible top navigation with the shorter label `일정`.
- Remove the large `/schedule` hero/title copy and make the page feel like a compact schedule tool.
- Make the default schedule view `오늘`.
- Add day/week/month-oriented controls while keeping button-style quick filtering.
- Keep team/university filtering out of this pass; add it later only after schedule posts store a stable team key.

Verification target for this refinement:

- `npm.cmd run test:schedule-info-page-contract`
- `npm.cmd run test:schedule-page-data-source-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`

Verification completed on 2026-05-14:

- `npm.cmd run test:schedule-info-page-contract`
- `npm.cmd run test:schedule-page-data-source-contract`
- `npm.cmd run test:schedule-info-board-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run pipeline:health`
- `npm.cmd run build`
- Browser smoke check: `http://localhost:3000/schedule` exposes visible nav `일정`, day/week/month controls, day quick filters, sr-only page heading, and the locked empty state.

## 2026-05-14 Calendar View Refinement

User-approved refinement:

- Keep `일별` as the today-first list with `오늘`, `내일`, `모레`, `전체` quick filters.
- Render `주별` as a 7-column weekly calendar.
- Render `월별` as a full monthly calendar grid.
- Provide `이전`, `오늘`, `다음` calendar navigation for week/month views.
- Keep inline details on the same page when a calendar schedule chip is opened.
- Use a minimum grid width with horizontal scrolling so mobile viewports do not crush the calendar cells.

Verification completed on 2026-05-14:

- RED/GREEN: `npm.cmd run test:schedule-info-page-contract`
- `npm.cmd run test:schedule-page-data-source-contract`
- `npm.cmd run test:schedule-info-board-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run pipeline:health`
- `npm.cmd run build`
- Browser smoke check: `http://localhost:3000/schedule` switches from `일별` to weekly and monthly calendar grids without console errors.

Final verification after review fixes on 2026-05-14:

- PASS: `npm.cmd run test:schedule-info-page-contract`
- PASS: `npm.cmd run test:schedule-page-data-source-contract`
- PASS: `npm.cmd run test:schedule-info-board-contract`
- PASS: `npx.cmd tsc --noEmit`
- PASS: `npm.cmd run lint`
- PASS: `npm.cmd run pipeline:health`
- PASS: `npm.cmd run build`
- PASS: read-only subagent re-review found no medium-or-higher risks after the `limit: 500` clamp and padded calendar lower bound.
- PASS: browser smoke check at `http://localhost:3000/schedule` confirmed day list, weekly calendar, monthly calendar, no browser errors, and mobile 390px calendar horizontal scrolling.

## 2026-05-14 End-of-Day Handoff

Current git state at handoff:

- Branch: `main`
- HEAD: `18015a7 Document schedule migration checklist`
- Local `main` is pushed to `origin/main`.
- Worktree was clean before writing this handoff note.

Completed today:

- `/schedule` is visible in the top navigation as the short schedule label.
- `/schedule` no longer uses the old large hero layout.
- `day` view remains a today-first list with quick filters.
- `week` view renders a 7-column calendar grid.
- `month` view renders a full month calendar grid.
- Calendar event chips are placed inside each date cell when schedule posts exist.
- Calendar chips expand inline on the same page.
- Mobile calendar uses a minimum grid width with horizontal scrolling.
- All local commits through `18015a7` have been pushed.

Verification completed today:

- `npm.cmd run test:schedule-info-page-contract`
- `npm.cmd run test:schedule-page-data-source-contract`
- `npm.cmd run test:schedule-info-board-contract`
- `npm.cmd run lint`
- `npm.cmd run pipeline:health`
- `npm.cmd run build`
- Browser QA at `http://localhost:3000/schedule` for day/week/month and 390px mobile width.

Production safety state:

- Production SQL has not been applied.
- Production data has not been inserted, updated, or deleted.
- Schedule schema migration remains blocked until explicit user approval in a future session.

Recommended next session entry:

1. Read `AGENTS.md`.
2. Read `docs/harness/SESSION_ENTRY.md`.
3. Run the mandatory orient commands.
4. Reopen this active plan.
5. Treat the next concrete decision as: whether to approve production schedule schema migration for the additive schedule columns and index only.

Suggested next-session user prompt:

```text
c:\Users\NZU\Desktop\nzu-homepage 작업 이어서 진행해줘.
반드시 AGENTS.md와 docs/harness/SESSION_ENTRY.md 순서대로 재진입하고,
active plan은 docs/harness/exec-plans/active/2026-05-13-schedule-info-board.md 기준으로 확인해줘.

현재 상태:
- branch: main
- HEAD: 18015a7 Document schedule migration checklist
- main은 origin/main과 동기화됨
- worktree clean
- 일정 UI/관리자 일정 MVP는 push 완료
- production SQL/data write는 아직 안 함

다음 작업:
1. production schedule schema migration 승인 여부를 다시 쉽게 설명해줘.
2. 승인하면 additive schedule columns/index만 적용하는 안전 절차로 진행해줘.
3. production 데이터 insert/update/delete는 별도 승인 전까지 하지 마.
```

Review follow-up completed on 2026-05-14:

- Calendar date math now uses `Date.UTC` with UTC getters/setters so browser local timezone cannot shift week/month cells.
- `/schedule` now fetches a bounded calendar window from 3 months before to 13 months after today with `limit: 500`.
- Week/month `이전` and `다음` buttons are disabled outside the fetched calendar window to avoid showing false empty states for unloaded periods.
