# Active Execution Plan Index

This index is the first stop after `SESSION_ENTRY.md`.

## Current Priority

Primary steering plan:

- `2026-04-20-pipeline-stabilization.md`

Current daily objective:

- Keep the data pipeline simple, stable, and accurate.
- Prevent repeat critical pipeline alerts before product polish work.
- Keep the home-page stabilization patch deployable, but do not push or deploy without operator approval.

Current final objective:

- Project-visible data contracts should preserve identity-first roster reasoning, section-specific match collection, fail-closed sync behavior, and actionable ops alerts.

## Active Plan Status

- `2026-04-20-pipeline-stabilization.md`: primary. Use for data pipeline, reliability, serving sync, alerts, and today's steering.
- `2026-05-01-prediction-ux-admin-flow.md`: secondary. Use only for prediction admin/public UX and prediction storage work.
- `2026-05-01-public-page-performance.md`: watchlist. Use only for public-page performance work.
- `2026-05-03-serving-projection-incremental-sync.md`: watchlist. Use only for serving projection sync work.
- Older April plans in this directory are archive candidates unless the user request directly names them.

## Architecture Backlog

Cross-cutting performance and architecture questions live in:

- `docs/harness/ARCHITECTURE_BACKLOG.md`

Treat backlog items as candidates, not approved implementation work. Promote one item into an active plan only after it becomes the current user-approved objective.

## Drift Guard

Before editing, answer:

`Which single active plan owns this work, and what is the next concrete step?`

If the answer is unclear, stop and reopen:

- `docs/harness/SESSION_ENTRY.md`
- `docs/harness/DRIFT_HOOKS.md`
- this index
