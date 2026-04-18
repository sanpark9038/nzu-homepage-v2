# Reliability

This is the reliability map for pipeline and alert work.

## Read Before Risky Changes

- [harness/CONFIDENCE_RULES.md](./harness/CONFIDENCE_RULES.md)
- [harness/RELIABILITY_RULES.md](./harness/RELIABILITY_RULES.md)
- [harness/FAILURE_MODES.md](./harness/FAILURE_MODES.md)
- [harness/TMP_STORAGE_AUDIT.md](./harness/TMP_STORAGE_AUDIT.md)

## Reliability Priorities

1. Separate observed facts from inferred state.
2. Prevent stale artifacts from steering current decisions.
3. Keep tmp cleanup safe, reversible, and identifier-aware.
4. Preserve enough observability to re-check why a report was produced.

## Current High-Risk Areas

- roster sync fallback behavior
- Discord wording that may overstate certainty
- stale `tmp/reports` or legacy `tmp/*.json` artifacts
- long-running work without an active execution plan
