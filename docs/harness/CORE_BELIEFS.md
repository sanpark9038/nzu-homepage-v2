# Core Beliefs

These are the harness beliefs that best fit the NZU homepage project.

## 1. The repository is the system of record

If a future AI cannot find a rule in versioned files, that rule is not reliable enough to drive production decisions.

## 2. Public alerts must distinguish fact from inference

Pipeline output may contain:

- direct source observations
- baseline-derived comparisons
- fallback assumptions

Human-facing summaries must not flatten those into one certainty level.

## 3. A partial scrape is a degraded observation, not a transfer confirmation

Missing one player from a roster scrape does not prove a real affiliation change.

## 4. Stability beats cleverness

This repo should prefer boring, inspectable patterns:

- explicit JSON artifacts
- replayable scripts
- named reports
- deterministic rules

## 5. Recovery context is first-class

Every long-running workflow should be resumable from repository state:

- current git state
- latest Actions status
- latest reports
- active execution plan

## 6. Every recurring human correction should become a rule or a document

If the same misunderstanding appears twice, it belongs in:

- a test
- a linter/check
- a reliability rule
- a failure mode document

## 7. "Collect-only" still needs truthfulness

Skipping Supabase sync does not lower the bar for operational messaging.
Advisory messages still need accurate certainty labels.

## 8. External AI onboarding should require no private chat history

A new model should be able to enter this project with:

- `README.md`
- `docs/README.md`
- `docs/harness/README.md`
- `docs/harness/PROJECT_SPEC.md`

and make correct decisions without hidden context.
