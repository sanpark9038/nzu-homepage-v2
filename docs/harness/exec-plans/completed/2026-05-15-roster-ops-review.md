# COMPLETED PLAN: roster-ops-review

Created: 2026-05-15
Completed: 2026-05-16
Status: completed-local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Add a small admin operations review surface that shows roster/data issues without changing public roster state automatically.

## Architecture

Keep mutation and review separate. A focused server-side helper builds read-only review groups from existing metadata and report files, an admin API exposes that summary, and a lightweight admin page renders counts plus expandable lists. Approval/exclusion actions for brand-new candidates are intentionally deferred to a later plan.

## Tech Stack

- Next.js App Router
- TypeScript/React
- Node contract tests under `scripts/tools`
- Existing metadata under `data/metadata`
- Existing report artifacts under `tmp/reports`

---

## Guardrails

- Do not push, deploy, or write production data.
- Do not use port 3001.
- Preserve locked public labels.
- Do not change SOOP live-state sync or Supabase Cron.
- The first pass is read-only: no roster mutation from the operations review page.
- Eloboard team/tier differences are review-only and must not update homepage metadata.

## Files

- Create: `lib/admin-roster-ops-review.ts`
  - Builds read-only review groups.
  - Reads project roster metadata and optional local report artifacts.
  - Does not write files.
- Create: `app/api/admin/roster/ops-review/route.ts`
  - Returns the review summary for the admin UI.
- Create: `app/admin/roster/ops-review/page.tsx`
  - Renders count summaries and expandable lists.
- Modify: `components/admin/AdminNav.tsx`
  - Adds the admin-only navigation entry for roster operations review if the current admin nav has a roster section.
- Create: `scripts/tools/admin-roster-ops-review-contract.test.js`
  - Contract test for helper/API/page wiring.
- Modify: `package.json`
  - Adds `test:admin-roster-ops-review`.

## Data Groups In Scope

1. Missing SOOP IDs
   - Approved roster players without `soop_user_id`.
   - Read from `data/metadata/projects/*/players.*.v1.json`.
2. Zero-record players
   - Players surfaced by the latest pipeline alerts as `zero_record_players`.
   - Read from newest local report artifact if present.
3. Roster change review
   - Eloboard affiliation/tier/race/name review items from `roster_change_review_latest.json`.
   - Display only; no automatic apply.
4. Excluded players
   - Existing collection exclusions from `pipeline_collection_exclusions.v1.json`.
   - Display as recovery reference only in this pass.
5. New player candidates
   - Add the group shape and empty state now.
   - Detection and approve/exclude mutations are deferred to the candidate workflow plan.

## Task 1: Contract Test

**Files:**
- Create: `scripts/tools/admin-roster-ops-review-contract.test.js`

- [x] **Step 1: Write the failing contract test**

The test should assert:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("ops review helper exposes read-only grouped review data", () => {
  const source = readProjectFile("lib/admin-roster-ops-review.ts");
  assert.match(source, /export async function buildRosterOpsReview/);
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.match(source, /roster_change_review/);
  assert.match(source, /excluded_players/);
  assert.match(source, /new_player_candidates/);
  assert.doesNotMatch(source, /writeFileSync|rmSync|saveRemoteRosterAdminCorrection/);
});

test("admin ops review API returns buildRosterOpsReview result", () => {
  const source = readProjectFile("app/api/admin/roster/ops-review/route.ts");
  assert.match(source, /buildRosterOpsReview/);
  assert.match(source, /NextResponse\.json\(\{\s*ok:\s*true/);
  assert.doesNotMatch(source, /POST|PATCH|DELETE/);
});

test("admin ops review page renders review groups without mutation controls", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.match(source, /roster_change_review/);
  assert.match(source, /excluded_players/);
  assert.match(source, /new_player_candidates/);
  assert.doesNotMatch(source, /승인|제외|fetch\(/);
});

test("package exposes the ops review contract test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  assert.equal(
    pkg.scripts["test:admin-roster-ops-review"],
    "node scripts/tools/admin-roster-ops-review-contract.test.js"
  );
});
```

- [x] **Step 2: Run the test and verify it fails**

Run: `node scripts/tools/admin-roster-ops-review-contract.test.js`

Expected: fails because the helper, API route, page, and package script do not exist yet.

## Task 2: Review Helper

**Files:**
- Create: `lib/admin-roster-ops-review.ts`

- [x] **Step 1: Implement the minimal read-only helper**

The helper should:

- discover `data/metadata/projects/*/players.*.v1.json`
- flatten approved roster players
- count missing `soop_user_id`
- read `data/metadata/pipeline_collection_exclusions.v1.json` when present
- read latest matching files under `tmp/reports/**` when present
- return stable empty groups when reports are absent
- avoid all writes

- [x] **Step 2: Run the contract test**

Run: `node scripts/tools/admin-roster-ops-review-contract.test.js`

Expected: still fails until the API/page/script are added.

## Task 3: API Route

**Files:**
- Create: `app/api/admin/roster/ops-review/route.ts`

- [x] **Step 1: Add a read-only GET route**

The route should call `buildRosterOpsReview()` and return:

```ts
return NextResponse.json({ ok: true, review });
```

No POST, PATCH, DELETE, production writes, or Supabase writes.

- [x] **Step 2: Run the contract test**

Run: `node scripts/tools/admin-roster-ops-review-contract.test.js`

Expected: still fails until the page/script are added.

## Task 4: Admin Page

**Files:**
- Create: `app/admin/roster/ops-review/page.tsx`
- Modify: `components/admin/AdminNav.tsx`

- [x] **Step 1: Add the page**

Render server-side data from `buildRosterOpsReview()`.

Use compact sections:

- summary count
- details/summary list for each group
- no mutation buttons

- [x] **Step 2: Add admin navigation**

Add an admin-only entry pointing to `/admin/roster/ops-review`. Do not change public navigation labels.

- [x] **Step 3: Run the contract test**

Run: `node scripts/tools/admin-roster-ops-review-contract.test.js`

Expected: still fails until `package.json` is updated.

## Task 5: Package Script And Verification

**Files:**
- Modify: `package.json`

- [x] **Step 1: Add npm script**

Add:

```json
"test:admin-roster-ops-review": "node scripts/tools/admin-roster-ops-review-contract.test.js"
```

- [x] **Step 2: Run targeted verification**

Run:

```powershell
npm.cmd run test:admin-roster-ops-review
npx.cmd tsc --noEmit
npm.cmd run lint
```

Expected: all pass.

- [x] **Step 3: Optional browser check**

If a local server is already needed, use port 3000 only:

```powershell
npm.cmd run dev
```

Then check `/admin/roster/ops-review`.

## Out Of Scope

- Approving new candidates.
- Excluding new candidates.
- Editing `display_name`.
- Editing SOOP ID.
- Applying Eloboard tier or affiliation changes.
- Supabase sync changes.
- SOOP live-state sync changes.

## Verification Results

- `node scripts/tools/admin-roster-ops-review-contract.test.js` failed before implementation because the helper, route, page, and package script were missing.
- `npm.cmd run test:admin-roster-ops-review` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- Browser check on port 3000 redirected unauthenticated access to the admin login page, rendered content, and showed no framework error overlay.
