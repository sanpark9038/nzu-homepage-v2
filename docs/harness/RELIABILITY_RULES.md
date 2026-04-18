# Reliability Rules

These rules define the harness boundaries that should guide future pipeline work.

## Affiliation-change rules

1. A roster disappearance from one team is not enough to publish a definitive move.
2. Explicit observation and fallback inference must be stored separately when possible.
3. Discord wording should reflect certainty:
   - confirmed move
   - inferred move
   - review required
4. FA fallback exists to preserve continuity, not to declare truth.
5. Manual overrides and allowlists must never silently masquerade as raw-source truth.

## Pipeline-output rules

1. Every human-facing run should preserve:
   - baseline source
   - current source
   - whether roster state came from direct observation or fallback
2. Reports should favor structured JSON artifacts before freeform chat explanations.
3. Any alert that changes player affiliation should be traceable to at least one report artifact.

## Incident rules

1. A false public-facing change creates a harness incident, even if serving data was not synced.
2. Each incident should record:
   - trigger
   - code path
   - why the guardrail failed
   - what future rule should prevent recurrence

## Documentation rules

1. Temporary handoff notes belong in archive once absorbed into current docs.
2. Agent-operating knowledge should live under `docs/harness/`.
3. Root-level docs should stay concise and stable.

## Suggested future code-level guardrails

These are not implemented yet, but they are the most valuable next enforcement points.

1. Introduce `change_confidence` for affiliation changes.
2. Fail or downgrade alerts when a move is produced only by FA fallback.
3. Add tests for single-player disappearance from an otherwise healthy team scrape.
4. Surface fallback-driven moves in a separate section of the Discord report.
