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
  read [PIPELINE_ONE_PAGE.md](/c:/Users/NZU/Desktop/nzu-homepage/PIPELINE_ONE_PAGE.md) before starting multi-step work.

## Mandatory self-check before work

Answer these internally before proceeding:

1. Is the intended task already captured in an active plan?
2. Does the task touch a known failure pattern in [FAILURE_MODES.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/FAILURE_MODES.md)?
3. Could the result affect a human-facing Discord or pipeline alert?

If the answer to 3 is yes, do not proceed without applying
[CONFIDENCE_RULES.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/CONFIDENCE_RULES.md).

## Planning rule

If the task is more than a one-step edit or check, create or update an active plan file first.

Use:

- [docs/harness/exec-plans/active/TEMPLATE.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/exec-plans/active/TEMPLATE.md)

## Recovery rule

If the session gets long, confusing, or derailed:

1. stop editing
2. re-run the mandatory entry order
3. reopen the active plan
4. reopen `FAILURE_MODES.md`
5. continue only after restating the next concrete step
