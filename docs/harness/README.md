# Harness Docs

This folder is the agent-facing operating map for the NZU homepage repository.

It adapts the harness-engineering ideas from OpenAI's February 11, 2026 article to this project's real failure modes:

- roster drift caused by incomplete source observations
- false affiliation changes in Discord alerts
- documentation drift between current code and older handoff notes
- long-running pipeline work that needs repeatable recovery context

## Start Here

- [SESSION_ENTRY.md](./SESSION_ENTRY.md): mandatory start-of-session checklist
- [MULTI_AGENT_WORKFLOW.md](./MULTI_AGENT_WORKFLOW.md): fixed role boundaries for Codex, Codex CLI, and Gemini
- [DRIFT_HOOKS.md](./DRIFT_HOOKS.md): in-session hooks that stop scope, feature, evidence, and ownership drift
- [CONFIDENCE_RULES.md](./CONFIDENCE_RULES.md): confidence semantics for moves and alerts
- [OPENAI_HARNESS_MAPPING.md](./OPENAI_HARNESS_MAPPING.md): what the OpenAI article says and how we apply it here
- [CORE_BELIEFS.md](./CORE_BELIEFS.md): project-specific harness principles
- [RELIABILITY_RULES.md](./RELIABILITY_RULES.md): hard rules for pipeline and alert behavior
- [FAILURE_MODES.md](./FAILURE_MODES.md): known pipeline failure patterns, including the `빡재TV` false move
- [SERVING_IDENTITY_NOTES.md](./SERVING_IDENTITY_NOTES.md): current write-key reality and the contract needed before identifier-based sync
- [STRUCTURE_DECISION.md](./STRUCTURE_DECISION.md): why the harness files live where they do
- [PROJECT_SPEC.md](./PROJECT_SPEC.md): detailed technical specification for handing this repo to another AI system

## Layer Above This Folder

The repo now uses short top-level maps instead of making this folder carry every concern:

- [../../AGENTS.md](../../AGENTS.md): short agent entry point
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md): system architecture map
- [../DESIGN.md](../DESIGN.md): design and doc-structure entry point
- [../PLANS.md](../PLANS.md): execution-plan entry point
- [../RELIABILITY.md](../RELIABILITY.md): reliability map

## Working Model

This repository should not rely on one giant instruction file.

Instead:

1. `README.md` explains the repo at a high level.
2. `docs/README.md` points to active operational docs.
3. `SESSION_ENTRY.md` defines how every meaningful session must begin.
4. `MULTI_AGENT_WORKFLOW.md` defines how Codex, Codex CLI, and Gemini must be split.
5. `DRIFT_HOOKS.md` defines what to do when the session starts wandering away from the current task.
6. `CONFIDENCE_RULES.md` defines how uncertain pipeline states must be handled.
7. This folder stores agent-first rules, failure analyses, and execution-plan context.
8. Concrete work tracking lives under `exec-plans/`.

## Structure

- `exec-plans/active/`: in-progress plans that agents can resume
- `exec-plans/completed/`: completed plans worth preserving for future runs
- `references/`: external references and normalized summaries for agent use

## Control Loop

When the session is fresh:

1. start with `SESSION_ENTRY.md`
2. inspect the active plan folder
3. keep `DRIFT_HOOKS.md` available if the task starts branching or expanding
4. check `FAILURE_MODES.md` before risky pipeline work
5. apply `CONFIDENCE_RULES.md` before any change that could affect alerts or affiliation output

When the session gets noisy or drifts:

1. stop
2. rerun the session entry checklist
3. reopen the active plan
4. continue from the documented next step

## Intent

The goal is not "more docs."

The goal is to make the repo itself the system of record so an external AI can:

- reconstruct current operating context quickly
- distinguish confirmed facts from fallback inferences
- avoid repeating known pipeline mistakes
- continue work without depending on hidden chat history
