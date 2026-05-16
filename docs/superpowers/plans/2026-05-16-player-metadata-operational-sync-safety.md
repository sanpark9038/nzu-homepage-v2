# Player Metadata Operational Sync Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move from local canonical player metadata cleanup to an operational sync decision with fewer chat stops, while keeping production writes, push, and deploy behind explicit user approval.

**Architecture:** Treat `data/metadata/projects/*/players.*.v1.json` as the only canonical player metadata source. Use read-only Supabase diff reports and local tests to classify risk before any write. Stop only at pre-declared approval gates: Supabase write, push, deploy, or unexpected diff/test failure.

**Tech Stack:** Node.js CommonJS scripts, npm scripts, Supabase JS read-only queries for diffing, existing approved push wrapper for any later write, markdown checkpoints in the active execution plan.

---

## Operating Boundaries

- Canonical source: `data/metadata/projects/*/players.*.v1.json`.
- Temporary reports under `tmp/reports/**` are decision evidence only, not source data.
- Archived legacy reference under `scripts/archive/player-metadata-source-consolidation/**` is historical evidence only.
- No port `3001`.
- No push, deploy, Supabase write, or cache revalidation unless the user explicitly approves that exact category.
- If a command fails or a diff shape changes materially, stop and report the exact evidence before continuing.

## Approval Gates

- Read-only local checks: proceed without asking.
- Read-only Supabase queries: proceed when the user has already chosen read-only diff investigation for this phase.
- Supabase staging/prod write: stop and ask for approval.
- Cache revalidation: stop and ask for approval unless included in an approved sync command.
- Git commit/push: stop and ask for approval.
- Deploy: stop and ask for approval.

---

### Task 1: Establish Fresh Read-Only Baseline

**Files:**
- Modify only if results need documentation: `docs/harness/exec-plans/active/2026-05-15-player-metadata-source-consolidation.md`
- Do not create new canonical metadata files.

- [ ] **Step 1: Re-run metadata source consolidation report**

Run:

```powershell
npm.cmd run report:metadata:source-consolidation
```

Expected:

```text
safe_soop_id_migration_candidates: 0
manual_review_soop_id_candidates: 0
excluded_soop_id_candidates: 14
legacy_dependency_paths: 0
```

Stop if any of those values change.

- [ ] **Step 2: Re-run project and master metadata validation**

Run:

```powershell
npm.cmd run validate:metadata:projects
npm.cmd run validate:metadata
npm.cmd run check:metadata:soop-id
npm.cmd run check:metadata:identity-aliases
```

Expected:

```text
validate:metadata:projects exits 0
validate:metadata exits 0
check:metadata:soop-id exits 0
check:metadata:identity-aliases exits 0
```

Stop if any command exits nonzero.

- [ ] **Step 3: Re-run serving diff in read-only Supabase mode**

Run:

```powershell
npm.cmd run report:serving-roster-diff -- --from-supabase
```

Expected current shape:

```text
canonical_rows: 318
serving_rows: 324
added: 0
removed: 6
changed: 43
```

If the counts differ, classify the new shape before any write.

### Task 2: Classify The Diff Without Writing

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-15-player-metadata-source-consolidation.md`
- Read: `tmp/reports/serving_roster_diff_latest.json`
- Read: `data/metadata/roster_manual_overrides.v1.json`
- Read: `data/metadata/pipeline_collection_exclusions.v1.json`

- [ ] **Step 1: Confirm removal candidates are excluded**

Run:

```powershell
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('tmp/reports/serving_roster_diff_latest.json','utf8')); const e=JSON.parse(fs.readFileSync('data/metadata/pipeline_collection_exclusions.v1.json','utf8')); function key(v){const s=String(v||''); const m=s.match(/eloboard:(male|female)(?::mix)?:(\\d+)/); if(m) return m[1]+':'+m[2]; return s.replace(/^eloboard:/,'');} const ids=new Set((e.players||[]).flatMap(p=>[key(p.entity_id), p.gender&&p.wr_id ? p.gender+':'+p.wr_id : '', p.wr_id ? 'male:'+p.wr_id : '', p.wr_id ? 'female:'+p.wr_id : '']).filter(Boolean)); const missing=r.removed.map(x=>x.key).filter(k=>!ids.has(k)); console.log(JSON.stringify({removed:r.removed.map(x=>x.key), missing_exclusion:missing},null,2)); if(missing.length) process.exit(1);"
```

Expected:

```json
{
  "removed": ["male:831", "male:199", "female:354", "male:377", "female:1033", "male:777"],
  "missing_exclusion": []
}
```

Stop if `missing_exclusion` is not empty.

- [ ] **Step 2: Confirm SOOP ID differences are backed by canonical evidence**

Run:

```powershell
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('tmp/reports/serving_roster_diff_latest.json','utf8')); const o=JSON.parse(fs.readFileSync('data/metadata/roster_manual_overrides.v1.json','utf8')); const text=JSON.stringify(o); const missing=r.changed_by_field.soop_id.map(x=>x.canonical_soop_id).filter(Boolean).filter(id=>!text.includes(id)); console.log(JSON.stringify({soop_diff_count:r.changed_by_field.soop_id.length, missing_canonical_evidence:missing},null,2)); if(missing.length) process.exit(1);"
```

Expected:

```json
{
  "soop_diff_count": 9,
  "missing_canonical_evidence": []
}
```

Stop if `missing_canonical_evidence` is not empty.

- [ ] **Step 3: Document the classification**

Append a short checkpoint to:

```text
docs/harness/exec-plans/active/2026-05-15-player-metadata-source-consolidation.md
```

Required content:

```markdown
- Fresh read-only sync decision checkpoint:
  - metadata source report still has safe 0, manual 0, excluded 14, legacy dependency paths 0.
  - serving diff still has added 0, removed 6, changed 43.
  - removal candidates remain covered by exclusions.
  - SOOP ID differences remain backed by canonical/user-confirmed metadata.
  - No Supabase write, push, deploy, or cache revalidation was performed.
```

### Task 3: Pre-Write Approval Decision

**Files:**
- No file changes unless recording the user's decision in the active plan.

- [ ] **Step 1: Present the decision in one sentence**

Say:

```text
현재 read-only 기준으로는 운영 반영 후보가 설명 가능합니다. 다음 단계는 Supabase staging/prod sync write이며, push/배포는 별도입니다. 승인하시겠어요?
```

- [ ] **Step 2: If the user does not approve write**

Do not run sync. Record:

```markdown
- User chose to keep operational sync on hold. No write performed.
```

- [ ] **Step 3: If the user approves only Supabase sync**

Proceed to Task 4. Do not push. Do not deploy.

### Task 4: Approved Supabase Sync Only

**Files:**
- Read/write through existing scripts only.
- Do not edit code during this task unless a guard fails and root cause investigation is needed.

- [ ] **Step 1: Run final read-only diff immediately before write**

Run:

```powershell
npm.cmd run report:serving-roster-diff -- --from-supabase
```

Expected:

```text
added: 0
removed: 6
changed: 43
```

If different, stop and return to Task 2.

- [ ] **Step 2: Run focused sync safety tests**

Run:

```powershell
npm.cmd run test:staging-sync
npm.cmd run test:prod-sync
npm.cmd run test:pipeline:push
npm.cmd run test:player-history-freshness-sentinel
```

Expected: all exit 0.

Stop if any command fails.

- [ ] **Step 3: Run approved Supabase push wrapper**

Run only after explicit user approval:

```powershell
npm.cmd run pipeline:push:approved
```

Expected:

```text
[OK] supabase_staging_sync
[OK] supabase_prod_sync
```

Cache revalidation may run inside this approved wrapper. Capture whether it reports `[OK]` or `[SKIP]`.

- [ ] **Step 4: Verify post-write serving diff**

Run:

```powershell
npm.cmd run report:serving-roster-diff -- --from-supabase
```

Expected:

```text
added: 0
removed: 0
changed: 0
```

If nonzero, stop and report exact counts.

- [ ] **Step 5: Verify freshness sentinel**

Run:

```powershell
npm.cmd run test:player-history-freshness-sentinel
node scripts/tools/verify-player-history-freshness-sentinel.js
```

Expected: both exit 0.

If the live sentinel still fails, stop and report the sentinel row and dates.

### Task 5: Post-Sync Documentation

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-15-player-metadata-source-consolidation.md`

- [ ] **Step 1: Record the outcome**

Append:

```markdown
- Approved operational sync checkpoint:
  - pre-write serving diff: record the exact added/removed/changed counts from `npm.cmd run report:serving-roster-diff -- --from-supabase`.
  - approved push wrapper result: record whether `supabase_staging_sync`, `supabase_prod_sync`, and cache revalidation reported OK, SKIP, or failed.
  - post-write serving diff: record the exact added/removed/changed counts from the post-write diff.
  - freshness sentinel: record the exact pass/fail status and any sentinel row/date if it fails.
  - push/deploy: record `not performed` unless the user separately approved them.
```

- [ ] **Step 2: Re-run canonical metadata guard**

Run:

```powershell
npm.cmd run report:metadata:source-consolidation
```

Expected:

```text
safe_soop_id_migration_candidates: 0
manual_review_soop_id_candidates: 0
excluded_soop_id_candidates: 14
legacy_dependency_paths: 0
```

Stop if values change.

### Task 6: Commit/Push/Deploy Are Separate

**Files:**
- No changes unless the user explicitly asks for commit, push, or deploy.

- [ ] **Step 1: If user asks to commit**

First run:

```powershell
git status --short --branch
```

Then propose a commit scope. Do not include unrelated dirty files without naming them.

- [ ] **Step 2: If user asks to push**

Ask for explicit confirmation because push was previously prohibited.

- [ ] **Step 3: If user asks to deploy**

Ask for explicit confirmation because deploy was previously prohibited.

---

## Stop Conditions

Stop and report instead of continuing if:

- metadata source report no longer says safe 0 / manual 0 / excluded 14 / legacy dependency paths 0
- serving diff has new added rows
- serving diff removal candidates are not covered by exclusions
- SOOP ID differences lack canonical evidence
- any sync safety test fails
- approved sync wrapper fails
- post-sync diff is not zero
- freshness sentinel fails after sync
- user asks to pause

## Non-Stop Conditions

Do not stop for:

- PowerShell profile execution-policy warning when the command exit code is 0
- refreshed `tmp/reports/**` files
- read-only Supabase diff output matching the expected shape
- documentation-only checkpoint updates
