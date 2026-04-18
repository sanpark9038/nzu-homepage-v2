# Execution Plans

Use this folder for resumable work plans that agents and humans can both continue.

- `active/`: plans still in progress
- `completed/`: plans worth keeping after completion

Keep plans concise, stateful, and linked to the code or docs they change.

## Rules

1. Multi-step work should have an active plan file before implementation starts.
2. Reused sessions should reopen an existing relevant active plan instead of starting from memory.
3. Completed plans should move to `completed/` once their outcome is stable.
4. Plans should include recovery commands and last-checked state.
