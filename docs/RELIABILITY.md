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
- name-based identity matching or dedupe in sync scripts
- name-based opponent matching remains a lower-confidence fallback until optional opponent durable identity is present
- missing-source writes that can null or reset existing serving data
- successful data push without immediate frontend cache invalidation
- staging snapshots that can be partially rebuilt before publish

For the current serving-identity transition guardrails and live-schema pass/fail checks, see:

- [harness/SERVING_IDENTITY_NOTES.md](./harness/SERVING_IDENTITY_NOTES.md)

## Repeated Structural Blind Spots

When pipeline problems repeat, do not stop at the visible symptom.

Re-check these structural questions before claiming a fix:

1. Is identity keyed by a durable identifier instead of a display name?
2. Can a temporary source failure erase or downgrade previously good serving data?
3. After a successful serving sync, will the homepage cache show the change immediately?
4. Can staging or intermediate snapshots be left half-built and still steer later publish steps?

If any answer is unclear, lower confidence and reopen the relevant sync or serving code before editing.
