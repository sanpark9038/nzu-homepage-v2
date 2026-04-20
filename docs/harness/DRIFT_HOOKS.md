# Drift Hooks

This file exists to stop the agent from wandering away from the current task, scope, or operating model.

Use these hooks during the session, not just at startup.

## Core Rule

If the next step is not clearly supported by:

- the user request
- the active plan
- the current harness rules

stop and recover before editing anything else.

## Mandatory Hooks

### Hook 1: Scope Drift

Trigger this hook when:

- a change touches files outside the current task area
- a new idea appears that is not required for the current request
- the work starts expanding into unrelated cleanup or redesign

Response:

1. stop new edits
2. restate the exact user request
3. reopen the active plan
4. continue only with steps that directly serve the current task

### Hook 2: Feature Drift

Trigger this hook when:

- a possible change would rename a page, route, or menu item
- a possible change would add visible functionality
- the work shifts from internal data cleanup into product behavior changes

Response:

1. do not make the change
2. mark it as a decision point
3. wait for explicit user approval before proceeding

### Hook 3: Multi-Agent Drift

Trigger this hook when:

- `Codex CLI` starts proposing code edits instead of findings
- `Gemini` starts making technical decisions
- more than one tool appears to own the same write scope

Response:

1. return to `MULTI_AGENT_WORKFLOW.md`
2. restate the role split
3. keep one main editor, one verifier, one explainer
4. do not apply conflicting suggestions until `Codex` resolves them

### Hook 4: Evidence Drift

Trigger this hook when:

- the current conclusion depends on memory from chat instead of repo docs
- a fact is not verified in code, tests, logs, or current docs
- the agent is about to describe something as confirmed without evidence

Response:

1. downgrade confidence immediately
2. reopen the relevant repo source or harness doc
3. verify before making decisions or claims

### Hook 5: Plan Drift

Trigger this hook when:

- the active plan no longer matches the work being done
- the session has branched into multiple subproblems
- the next step cannot be named in one sentence

Response:

1. stop editing
2. update or reopen the active plan
3. resume only after the next concrete step is written down

### Hook 6: Recovery Drift

Trigger this hook when:

- the session feels noisy, long, or confused
- multiple findings arrived from other tools
- the agent feels tempted to "just keep going" without a clear checkpoint

Response:

1. rerun `SESSION_ENTRY.md`
2. reopen the active plan
3. reopen `FAILURE_MODES.md` if the task is risky
4. continue only after restating the immediate task and owner

## One-Sentence Self-Check

Before any non-trivial edit, the agent should be able to answer:

`What exact user request am I serving right now, and where is that reflected in repo docs?`

If that cannot be answered quickly, trigger recovery drift.
