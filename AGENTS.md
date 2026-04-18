# AGENTS

This file is the short map for working in `nzu-homepage`.

Do not treat this file as an encyclopedia. Read it first, then follow the linked docs.

## Session Start

1. Read [docs/harness/SESSION_ENTRY.md](docs/harness/SESSION_ENTRY.md).
2. Run the required orient commands.
3. Check [docs/harness/exec-plans/active/](docs/harness/exec-plans/active/).
4. If the work can affect roster state, alerts, or reports, read [docs/RELIABILITY.md](docs/RELIABILITY.md).

## Repo Map

- [README.md](README.md): high-level repo overview
- [ARCHITECTURE.md](ARCHITECTURE.md): layered system map
- [docs/README.md](docs/README.md): living docs index
- [docs/DESIGN.md](docs/DESIGN.md): design and harness philosophy
- [docs/PLANS.md](docs/PLANS.md): execution-plan rules and tech debt tracking
- [docs/RELIABILITY.md](docs/RELIABILITY.md): confidence, failure modes, and ops safety
- [docs/references/index.md](docs/references/index.md): normalized external references

## Current Ground Truth

- Product and technical scope: [docs/harness/PROJECT_SPEC.md](docs/harness/PROJECT_SPEC.md)
- Pipeline contract: [PIPELINE_DATA_CONTRACT.md](PIPELINE_DATA_CONTRACT.md)
- Daily pipeline overview: [PIPELINE_ONE_PAGE.md](PIPELINE_ONE_PAGE.md)
- Current harness rules: [docs/harness/README.md](docs/harness/README.md)

## Operating Rules

- Keep guidance layered and short. Do not create one giant instruction document.
- Encode important decisions into repo-visible markdown. Hidden chat context is not durable.
- Prefer identifier-based reasoning over name-based reasoning for players and rosters.
- Treat fallback or inferred roster state as lower-confidence output until verified.
- Use active execution plans for multi-step work.

## Drift Recovery

If the session gets noisy, stop and reset:

1. Re-run [docs/harness/SESSION_ENTRY.md](docs/harness/SESSION_ENTRY.md).
2. Re-open the active plan.
3. Check [docs/harness/FAILURE_MODES.md](docs/harness/FAILURE_MODES.md).
4. Continue only after the next step is explicit in repo docs.
