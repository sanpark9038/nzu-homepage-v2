# Multi-Agent Workflow

This document fixes the default working model for this repository when multiple AI tools are available.

The goal is speed without overlapping edits, hidden assumptions, or recovery confusion.

## Default Roles

Use these roles unless the active plan explicitly says otherwise.

- `Codex` in the IDE: main implementer and final editor
- `Codex CLI` in the terminal: verification and review partner
- `Gemini` in Antigravity: beginner-friendly explainer and summary writer

## Role Boundaries

### `Codex`

`Codex` owns:

- code edits
- architecture decisions
- active execution-plan updates
- harness doc updates that change operating rules
- final integration when multiple findings come back

`Codex` is the default source of truth for what changes in the repo.

### `Codex CLI`

`Codex CLI` is read-only by default.

Use it for:

- browser verification
- route and UI checks
- lint or targeted test runs
- log inspection
- code review findings
- regression checks against the current worktree

Do not let `Codex CLI` edit files unless:

1. the write scope is explicitly separated from `Codex`
2. the exact owned files are named in the active plan
3. no file overlap exists

If those conditions are not met, keep `Codex CLI` in verification mode only.

### `Gemini`

`Gemini` acts like a teacher for non-technical users.

Use it for:

- simple folder explanations
- easy summaries of current work
- beginner-friendly pipeline explainers
- glossary drafts
- operator-facing notes in plain language

Do not use `Gemini` for:

- code edits
- config changes
- file moves or deletes
- pipeline logic decisions
- reliability or confidence-rule changes
- final technical judgment

If `Gemini` or another external AI raises technical risks, treat them as review findings only.
`Codex` must verify each claim in repo code, tests, or logs before changing docs or implementation.

## Safe Default Loop

For normal work, follow this order:

1. `Codex` reads `SESSION_ENTRY.md` and the active plan
2. `Codex` performs the implementation
3. `Codex CLI` checks the result without editing
4. `Gemini` writes plain-language explanations only if needed, or provides review findings that `Codex` must verify
5. `Codex` reviews findings and makes final repo changes
6. `Codex` updates the active plan with the outcome

## Parallel Work Rule

Parallel work is allowed only when ownership is clear.

Safe example:

- `Codex`: `app/`, `components/`, `lib/`
- `Codex CLI`: no edits, verification only
- `Gemini`: docs draft in plain language, no technical rule changes

Risky example:

- `Codex` and `Codex CLI` both editing the same route or helper
- `Gemini` rewriting a harness rule or pipeline contract

If ownership is not obvious, stop parallel edits and return to the safe default loop.

If role boundaries start drifting during the session, trigger
[DRIFT_HOOKS.md](./DRIFT_HOOKS.md),
especially `Multi-Agent Drift` and `Plan Drift`.

## Prompting Rules

When asking `Codex CLI` to help, prefer prompts like:

- "Do not edit files. Verify `/entry`, `/match`, `/tier`, and `/player` for data consistency and report findings only."
- "Read-only review. Check browser behavior and console errors for the current worktree."

When asking `Gemini` to help, prefer prompts like:

- "Explain this folder to a beginner in simple Korean."
- "Describe this pipeline step-by-step without heavy coding terms."

Avoid prompts that blur roles, such as:

- "Fix anything you find"
- "Refactor this however you think is best"
- "Rewrite the system docs"

## Fresh-Start Recovery

If a new chat starts and the previous conversation is gone, do not rely on memory.

Recover in this order:

1. read `AGENTS.md`
2. read `docs/harness/SESSION_ENTRY.md`
3. open the active plan
4. read this file if more than one AI tool will be used
5. restate the role split before delegating anything

Use this restatement by default:

- `Codex`: implements and makes final repo changes
- `Codex CLI`: verifies in read-only mode
- `Gemini`: explains in simple language only

If a new session cannot state that split clearly, treat the session as not yet recovered.

## Starter Prompts

Use these minimal prompts after a restart unless the active plan says otherwise.

### `Codex CLI` starter

```text
Do not edit files. Read-only review only.
Check the current worktree for regressions, browser/runtime errors, and missing verification.
Report findings only.
```

### `Gemini` starter

```text
Do not edit code, config, files, or rules.
Act like a beginner-friendly teacher and only write simple explanations, summaries, or glossary drafts.
If anything is uncertain, say "confirm needed".
```

## Conflict Rule

If another AI suggests a repo change that conflicts with the current plan:

1. do not apply it immediately
2. record the suggestion in the active plan or session notes
3. let `Codex` decide whether it becomes a real repo change

This keeps the repo from drifting due to parallel hidden decisions.

## Session Recovery

If multi-agent work gets confusing:

1. stop new edits
2. re-run `SESSION_ENTRY.md`
3. reopen the active plan
4. restate current ownership
5. continue only after the next step is explicit

## One-Line Rule

One main editor, one verifier, one explainer.

That is the default operating model for this repository.
