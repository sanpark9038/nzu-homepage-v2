# Quality Score

Use this lightweight rubric when judging whether a change is complete enough to trust.

## Scorecard

- `0`: no context recovery, no validation, high drift risk
- `1`: change made, but no plan or reliability check
- `2`: relevant docs read, but weak validation
- `3`: correct layer changed, basic validation passed
- `4`: docs, validation, and recovery context updated
- `5`: confidence-aware, observable, resumable, and easy for the next agent to continue

## What A Good Change Looks Like

- starts from session entry
- uses the right source of truth
- updates the active plan if the task is non-trivial
- adds or updates a failure mode when the repo learns something new
