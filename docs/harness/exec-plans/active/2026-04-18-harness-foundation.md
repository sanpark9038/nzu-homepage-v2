# ACTIVE PLAN: harness-foundation

Created: 2026-04-18
Status: in-progress

## Goal

Install a durable harness entry flow so future sessions stay aligned to repo context, confidence rules, and resumable plans.

## Completed steps

- [x] Create `docs/harness/SESSION_ENTRY.md`
- [x] Create `docs/harness/CONFIDENCE_RULES.md`
- [x] Create `docs/harness/STRUCTURE_DECISION.md`
- [x] Create active plan template under `docs/harness/exec-plans/active/`
- [x] Update harness index docs to point at the new control files
- [x] Add `change_confidence` to roster sync moved/added records
- [x] Teach Discord summary formatting to avoid definitive wording for `fallback` and `inferred` affiliation changes
- [x] Add targeted tests for confidence lookup and fallback wording
- [x] Add verification-time checks so `verify-discord-summary` reconstructs affiliation changes with the correct `reportsDir` confidence lookup
- [x] Add a harness-aware verification test for fallback affiliation changes
- [x] Audit `tmp/` storage and document which directories and root files are safe to prune
- [x] Add cleanup automation for stale `tmp/` root directories and clearly out-of-scope root files
- [x] Add duplicate-root cleanup automation for canonical-vs-fallback `tmp/` artifacts
- [x] Add short top-level harness maps (`AGENTS.md`, `ARCHITECTURE.md`) instead of growing one giant instruction file
- [x] Add layered docs entry points for design, plans, reliability, product sense, frontend, references, and generated material

## Next steps

- [ ] Extend confidence semantics to any remaining affiliation-change producers beyond Discord summary formatting
- [ ] Add a plan-completion flow that moves finished plans into `completed/`
- [ ] Add mutation-time or alert-time escalation for clustered inferred affiliation changes from the same roster/source anomaly
- [ ] Decide whether `TOMORROW_RUNBOOK.md` should stay separate or fold into the newer harness layer

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

- Actions run id: `24602371516` (latest checked SOOP Live Sync run)
- Report artifact: local `tmp/reports/team_roster_sync_report.json`
- git HEAD: check with `git log --oneline -1`

## Files in play

- `docs/harness/README.md`
- `docs/harness/FAILURE_MODES.md`
- `docs/harness/SESSION_ENTRY.md`
- `docs/harness/CONFIDENCE_RULES.md`
- `docs/harness/STRUCTURE_DECISION.md`
- `docs/harness/exec-plans/active/TEMPLATE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/PLANS.md`
- `docs/RELIABILITY.md`
- `docs/PRODUCT_SENSE.md`
- `docs/FRONTEND.md`
- `docs/references/index.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `scripts/tools/sync-team-roster-metadata.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/send-manual-refresh-discord.test.js`
- `scripts/tools/sync-team-roster-metadata.test.js`
- `scripts/tools/verify-discord-summary.js`
- `scripts/tools/verify-discord-summary.test.js`

## New failure modes found

- FM-004: clustered inferred affiliation changes can still look operationally real even when wording is compliant
