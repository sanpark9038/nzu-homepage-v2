# Plans

This is the plan-system entry point.

## Canonical Plan Location

Active and resumable plans currently live under [harness/exec-plans/](./harness/exec-plans/README.md).

Use an active plan when work is multi-step, spans sessions, or changes pipeline behavior.

## Rules

- Keep one task per plan file.
- The next step must be explicit.
- Update the plan when a new blocker or failure mode appears.
- Do not rely on chat history instead of a plan file.

## Related Docs

- [harness/exec-plans/README.md](./harness/exec-plans/README.md)
- [exec-plans/tech-debt-tracker.md](./exec-plans/tech-debt-tracker.md)
- [harness/SESSION_ENTRY.md](./harness/SESSION_ENTRY.md)
