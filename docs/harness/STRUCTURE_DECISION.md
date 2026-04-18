# Harness Structure Decision

This document explains why the harness files live where they do.

## Decision

The harness layer for this repository lives under:

- `docs/harness/`

and not at the repository root.

## Reasoning

This project already has active root-level operational docs and a meaningful historical archive.

Placing the harness under `docs/` preserves the existing repo layout while adding an agent-first control layer.

## Folder responsibilities

### `README.md`

- top-level repository overview
- human-friendly entry point

### `docs/README.md`

- index of active docs
- bridge between root docs and harness docs

### `docs/harness/`

- agent operating rules
- recovery checklists
- confidence rules
- failure modes
- project spec for external AI context

### `docs/harness/exec-plans/active/`

- in-progress plans that survive session resets
- the first place to look before resuming a multi-step task

### `docs/harness/exec-plans/completed/`

- finished plans worth preserving as future context

### `tmp/`

- runtime artifacts
- reports
- temporary machine state

Do not use `tmp/` as the sole storage for reasoning or long-lived task intent.

## Operational consequence

If the agent starts drifting:

1. re-enter through `SESSION_ENTRY.md`
2. reopen the active plan
3. reopen `FAILURE_MODES.md`
4. continue from the documented next step

## Non-goal

This structure is not intended to be a complete repo-wide framework rewrite.

It is intentionally additive and minimal so the current project can keep moving while gaining stronger agent control.
