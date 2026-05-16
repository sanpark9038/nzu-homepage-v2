# ACTIVE PLAN: admin-roster-ui-information-architecture

Created: 2026-05-15
Status: completed-local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Refine the admin roster operations review page so operators can understand priority, source, and next action without adding roster mutations.

## Architecture

Keep the existing read-only helper and API. Improve only the admin page information architecture and its source-level contract: group review data into decision queue, data-quality checks, and recovery reference; preserve expandable details; add non-mutating process links to the roster editor.

## Guardrails

- Do not push or deploy.
- Do not use port 3001; use port 3000 only for local browser checks.
- Do not mutate roster metadata, Supabase data, report artifacts, or production data.
- Preserve public locked labels.
- Treat Eloboard roster/tier differences as review-only.

## Files

- Modify: `scripts/tools/admin-roster-ops-review-contract.test.js`
- Modify: `app/admin/roster/ops-review/page.tsx`

## Task 1: Contract

- [x] **Step 1: Extend the contract test**

Assert that the page includes IA concepts for `decision_queue`, `data_quality`, `reference`, `ReviewQueueSection`, `nextAction`, and `Open roster editor`.

- [x] **Step 2: Run the test and verify it fails**

Run: `node scripts/tools/admin-roster-ops-review-contract.test.js`

Expected: fails because the page still lacks the IA structure.

## Task 2: Page IA

- [x] **Step 1: Refactor the page into review queue sections**

Add static group metadata, section wrappers, next-action copy, generated/source context, and process links without client fetches or mutation controls.

- [x] **Step 2: Run the contract test**

Run: `npm.cmd run test:admin-roster-ops-review`

Expected: passes.

## Task 3: Verification

- [x] **Step 1: Run TypeScript**

Run: `npx.cmd tsc --noEmit`

- [x] **Step 2: Run lint**

Run: `npm.cmd run lint`

- [x] **Step 3: Browser check on port 3000 only if needed**

Run: `npm.cmd run dev`, then inspect `/admin/roster/ops-review`. Do not start or use port 3001.

## Verification Results

- `node scripts/tools/admin-roster-ops-review-contract.test.js` failed after the contract update because the page did not yet include the new IA markers.
- `npm.cmd run test:admin-roster-ops-review` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run lint` passed.
- Browser check used port 3000 only. `/admin/roster/ops-review` redirected unauthenticated access to admin login and showed no browser errors in `agent-browser.cmd errors`.
