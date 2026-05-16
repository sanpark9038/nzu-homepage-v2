# Serving Roster Diff Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only report that previews how canonical project metadata would change public serving roster data before any Supabase write.

**Architecture:** Add one focused Node script that loads `data/metadata/projects/*/players.*.v1.json`, applies collection exclusions, optionally compares against a serving snapshot or read-only Supabase `players` query, and writes JSON/Markdown reports. Add a small contract test for no-write behavior and diff classification.

**Tech Stack:** Node.js CommonJS scripts, existing project metadata loader, Supabase JS client only for explicit read-only mode, JSON/Markdown reports under `tmp/reports`.

---

### Task 1: Contract Test

**Files:**
- Create: `scripts/tools/report-serving-roster-diff.test.js`
- Modify: `package.json`

- [x] **Step 1: Add tests for read-only report behavior**

Create `scripts/tools/report-serving-roster-diff.test.js` with assertions that the report script exports pure diff helpers, does not call write/upsert/delete Supabase operations, and classifies added/removed/changed/unchanged rows.

- [x] **Step 2: Add npm script**

Add `test:serving-roster-diff` and `report:serving-roster-diff` entries to `package.json`.

- [x] **Step 3: Run the test**

Run: `npm.cmd run test:serving-roster-diff`

Expected: PASS once Task 2 is implemented.

### Task 2: Read-Only Report Script

**Files:**
- Create: `scripts/tools/report-serving-roster-diff.js`
- Modify: `docs/harness/exec-plans/active/2026-05-15-player-metadata-source-consolidation.md`

- [x] **Step 1: Implement local canonical roster loading**

Use `scripts/tools/lib/project-player-metadata.js` to load canonical rows and filter out `data/metadata/pipeline_collection_exclusions.v1.json`.

- [x] **Step 2: Implement serving source loading**

Support `--serving-json=<path>` for offline comparison and `--from-supabase` for explicit read-only Supabase comparison. Without either flag, generate a canonical-only summary.

- [x] **Step 3: Implement diff output**

Write `tmp/reports/serving_roster_diff_latest.json` and `tmp/reports/serving_roster_diff_latest.md` with counts and previews for added, removed, affiliation changes, tier changes, race changes, SOOP changes, and unchanged rows.

- [x] **Step 4: Document usage in the active plan**

Record that this report is the safe checkpoint before staging/prod sync.

### Task 3: Verification

**Files:**
- No additional files.

- [x] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd run test:serving-roster-diff
npm.cmd run report:serving-roster-diff
```

Expected: report generation succeeds with no Supabase write.

- [x] **Step 2: Run metadata safety checks**

Run:

```powershell
npm.cmd run validate:metadata:projects
npm.cmd run report:metadata:source-consolidation
```

Expected: 324 project players, 0 safe/manual SOOP candidates, 0 active legacy dependencies.
