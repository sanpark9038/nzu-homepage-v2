# SESSION ENTRY CHECKLIST

This file exists to keep the agent on-track at the start of every session.

Starting meaningful work without following this checklist is a harness violation.

## Mandatory entry order

Do not skip steps.

1. Run:

```powershell
git status --short --branch
```

2. Run:

```powershell
git log --oneline -5
```

3. Run:

```powershell
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

4. Run:

```powershell
Get-ChildItem tmp\reports
```

5. Check:

```powershell
Get-ChildItem docs\harness\exec-plans\active
```

## Required reading rule

- If `docs/harness/exec-plans/active/` contains one or more plan files:
  read the most relevant active plan before changing code or docs.
- If `docs/harness/exec-plans/active/` is empty:
  read [PIPELINE_ONE_PAGE.md](../../PIPELINE_ONE_PAGE.md) before starting multi-step work.
- If multiple AI tools will be used in the session:
  read [MULTI_AGENT_WORKFLOW.md](./MULTI_AGENT_WORKFLOW.md) before delegating work.
- If the task is likely to branch, expand, or invite unrelated cleanup:
  read [DRIFT_HOOKS.md](./DRIFT_HOOKS.md) before editing.

## Multi-agent recovery rule

If this session uses `Codex`, `Codex CLI`, or `Gemini`, recover the role split before doing meaningful work.

Default split:

- `Codex`: main implementer and final editor
- `Codex CLI`: read-only verifier unless the active plan explicitly assigns a separate write scope
- `Gemini`: beginner-friendly explainer only

Before using more than one AI tool, make sure all three checks are true:

1. the active plan names the current task or scope
2. only one tool owns repo edits by default
3. any verifier or explainer prompt says not to edit files

If those checks are not true, stop and fix the prompts or plan first.

## Drift prevention rule

During the session, if the work starts expanding beyond the current user request or active plan:

1. stop editing
2. open [DRIFT_HOOKS.md](./DRIFT_HOOKS.md)
3. identify which hook fired
4. recover before continuing

## Session start prompts

Use these as the default starting point after a fresh restart.

### `Codex CLI`

```text
Do not edit files. Read-only verification only.
Review the current worktree for regressions, data mismatches, console/server errors, and missing checks.
Report findings only.
```

### `Gemini`

```text
Do not edit code, config, or rules.
Act like a teacher for beginners and only write simple explanations or summaries.
Do not suggest copy-pasteable code blocks intended for direct use.
If anything is unclear, say "confirm needed".
```

## Mandatory self-check before work

Answer these internally before proceeding:

1. Is the intended task already captured in an active plan?
2. Does the task touch a known failure pattern in [FAILURE_MODES.md](./FAILURE_MODES.md)?
3. Could the result affect any human-facing or ops-facing output such as Discord summaries, GitHub Actions summaries, `tmp/reports/*latest.json`, homepage integrity or freshness signals, roster sync deltas, tier changes, or affiliation-change alerts?
4. If the task touches pipeline ingest, staging sync, prod sync, or homepage serving, have I checked for the recurring structural risks first: name-based identity collisions, source-missing resets of existing serving data, stale frontend cache after successful sync, and partial-state publish safety?

If the answer to 3 or 4 is yes, do not proceed without applying
[CONFIDENCE_RULES.md](./CONFIDENCE_RULES.md).

## Planning rule

If the task is more than a one-step edit or check, create or update an active plan file first.

Use:

- [docs/harness/exec-plans/active/TEMPLATE.md](./exec-plans/active/TEMPLATE.md)

## Recovery rule

If the session gets long, confusing, or derailed:

1. stop editing
2. re-run the mandatory entry order
3. reopen the active plan
4. reopen `FAILURE_MODES.md`
5. continue only after restating the next concrete step
