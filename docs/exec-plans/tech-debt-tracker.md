# Tech Debt Tracker

This tracker captures harness and ops debt that still reduces agent reliability.

## Open Items

- Add stronger stale-artifact age gates for `tmp/reports` consumers.
- Expand automated checks that reject confidence-less affiliation changes.
- Reduce overlap between `TOMORROW_RUNBOOK.md` and newer harness session docs.
- Decide whether to migrate plan storage from `docs/harness/exec-plans/` into `docs/exec-plans/` later.
- Add a light session-exit snapshot convention for long-running work.
