# GitHub Actions First Run Failure

> Historical incident note.
> This document describes the first failure state only.
> It does not represent the current production status by itself.
> Later follow-up, fixes, and successful reruns should be read together before judging current readiness.

## Summary
The first GitHub Actions run did not fail because the pipeline could not execute.

It failed because the first chunk produced abnormally weak collection results, and the existing `strict` safety rules correctly blocked the run.

## Observed Failure
Workflow log excerpt showed:

- `collect_chunked` started
- `CHUNK 1/5` failed after about 8 minutes 49 seconds
- `pipeline:status` then reported blocking alerts

## What The Status Output Showed
For chunk 1 teams:
- `BGM`
- `흑카데미`
- `씨나인`

The pipeline reported large counts of `zero_record_players`:

- `BGM`: 13
- `흑카데미`: 11
- `씨나인`: 14

This is not normal relative to local execution.

## What This Means
The failure was not:
- a Node crash
- a missing dependency issue
- a bad secret issue
- a filesystem path issue

The failure was:
- the collection result quality became abnormal
- the pipeline safety rules treated that as blocking
- the run stopped before continuing to later chunks

## Why The Safety Rules Blocked It
[scripts/tools/run-daily-pipeline.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-daily-pipeline.js)
has strict alert rules.

`zero_record_players` is treated as a blocking issue unless explicitly allowlisted.

So the pipeline behaved correctly:
- bad collection quality was detected
- unsafe results were prevented from progressing

## Most Likely Cause
The most likely cause is upstream collection instability in the GitHub Actions runner environment.

In practical terms:
- ELOBoard responses in GitHub Actions likely differed from local responses
- pages may have returned partial data, slower responses, or runner-specific degraded results
- the pipeline then parsed many players as having zero match data

This pattern matches the observed outcome:
- players were found
- but many match records were effectively empty

## Why This Does Not Immediately Disprove GitHub Actions
This failure does **not** prove that GitHub Actions itself is impossible for the project.

It proves something narrower:
- the current collection behavior in GitHub Actions does not yet match local collection reliability

That is an upstream/runtime quality issue, not an execution-environment impossibility proof.

## Current Best Interpretation
At this stage:
- GitHub Actions execution is technically working
- but data quality inside the runner is not yet trusted
- and the strict guardrails are correctly preventing unsafe promotion

## Recommended Next Step
Do not treat this as a "retry until it passes" situation.

The correct next step is debugging.

Specifically:
1. run only chunk 1 or only the affected teams
2. preserve artifacts
3. compare generated JSON/report outputs
4. identify whether the issue is:
   - upstream HTML difference
   - rate limiting
   - request timeout / partial response
   - runner-specific network behavior

## Historical Conclusion At That Time
At the time of this first run, GitHub Actions was not yet ready to be trusted for this pipeline.

That conclusion was specific to the initial failure state and should not be read as the final current-state verdict.
