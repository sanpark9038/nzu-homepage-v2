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

## Current State

- Implementation complete and committed.
- Production SQL has not been applied.
- Production data has not been written.
- Public `/schedule` fails softly with the normal empty state when schedule columns are not migrated yet.
- Next step is a separate, explicit production DB migration approval before deployed admin schedule writes can succeed.

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

Review follow-up completed on 2026-05-14:

- Calendar date math now uses `Date.UTC` with UTC getters/setters so browser local timezone cannot shift week/month cells.
- `/schedule` now fetches a bounded calendar window from 3 months before to 13 months after today with `limit: 500`.
- Week/month `이전` and `다음` buttons are disabled outside the fetched calendar window to avoid showing false empty states for unloaded periods.
