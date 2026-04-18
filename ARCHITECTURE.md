# Architecture

This repository uses a layered operating model so the agent can recover context quickly.

## Core Layers

1. `providers`
   Source systems such as Eloboard, SOOP, GitHub Actions artifacts, and Supabase.

2. `collection + sync`
   Scripts under `scripts/tools/` that collect upstream data, normalize it, compare it, and produce reports.

3. `metadata + contracts`
   Durable JSON under `data/metadata/` plus pipeline contracts that define what the site and sync paths may trust.

4. `serving + runtime`
   Supabase-backed serving data and the Next.js application under `app/`, `components/`, and `lib/`.

5. `reporting + alerts`
   Report artifacts, Discord summaries, freshness checks, and GitHub Actions outputs.

6. `harness + docs`
   Repo-visible instructions, failure modes, plans, and references that keep agent work aligned.

## Cross-Cutting Boundaries

- `types + ids`
  Player identity should prefer durable identifiers such as `entity_id`, `wr_id`, and `profile_url`.

- `config + secrets`
  Environment variables and workflow configuration control sync behavior and alerting behavior.

- `observability`
  `tmp/reports`, workflow runs, test outputs, and validation scripts provide the feedback loop for agent work.

## Allowed Flow

1. Observe current state.
2. Read or update the relevant contract.
3. Change code or docs in the correct layer.
4. Validate with tests, reports, or workflow-facing checks.
5. Record any new rule or failure mode in repo-visible docs.

## Anti-Patterns

- Treating `tmp/` artifacts as permanent truth
- Reporting inferred affiliation changes as confirmed facts
- Storing critical operating knowledge only in chat history
- Expanding one doc until it becomes a stale manual

## Related Docs

- [AGENTS.md](AGENTS.md)
- [docs/DESIGN.md](docs/DESIGN.md)
- [docs/RELIABILITY.md](docs/RELIABILITY.md)
- [docs/harness/PROJECT_SPEC.md](docs/harness/PROJECT_SPEC.md)
