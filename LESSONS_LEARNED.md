# Lessons Learned

This document records project-level lessons that should change how we work next time, not just what failed once.

Use this with `docs/harness/FAILURE_MODES.md`.

- `FAILURE_MODES.md`: what failed, where it showed up, and what technical guard is needed
- `LESSONS_LEARNED.md`: why we let it happen, and what operating principle should change next time

## LL-001: PowerShell encoding loop

### 언제 발생했는지

- 2026-04-20 ~ 2026-04-22 sessions during Windows PowerShell-based repo work

### 무슨 일이었는지

- Korean text in docs, admin copy, and command output repeatedly appeared garbled in the terminal.
- The same files were re-checked because the session could not trust whether the text was truly broken in the repo or only broken in console output.

### 근본 원인

- Session startup did not force UTF-8 console output before reading or editing Korean-heavy files.
- PowerShell profile noise and mixed console defaults made output corruption look like repo corruption.

### 재발방지 원칙

- Always pin PowerShell UTF-8 at session start before reading or editing Korean text:
  - `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
  - `$env:PYTHONUTF8 = "1"`
- Treat console garbling as an environment problem first, not a repo-truth problem.
- Do not “fix” Korean copy until the same text is verified from a UTF-8-safe session or trusted file view.

## LL-002: User-visible UI labels are not cleanup targets

### 언제 발생했는지

- 2026-04-20 ~ 2026-04-22 sessions while public pages and admin pages were being cleaned up for deployment

### 무슨 일이었는지

- Existing navigation, button, and filter labels were changed during unrelated refactors and cleanup.
- That created avoidable churn because copy decisions were mixed into behavior or layout work.

### 근본 원인

- The repo had a rule about not renaming visible labels without explicit user intent, but it was too easy for that rule to stay implicit.
- UI wording was treated as implementation detail instead of product copy contract.

### 재발방지 원칙

- Existing visible labels must remain unchanged unless the user explicitly asks for a wording change.
- Product copy should be locked in repo-visible guidance, not preserved only through chat memory.
- When touching UI behavior, layout, or styling, review whether any visible text changed unintentionally before finalizing.

## LL-003: Session re-entry needs reusable conflict context

### 언제 발생했는지

- 2026-04-19 ~ 2026-04-22 across multi-session work on homepage refresh and pipeline stabilization

### 무슨 일이었는지

- Each session had to spend time re-reading the same files to infer which edits were likely to collide and which files were safe to change independently.
- Active plans captured “files in play,” but they did not explicitly separate conflict-prone files from safely isolated files.

### 근본 원인

- Session recovery captured scope, but not enough implementation-level re-entry context.
- The repo lacked a standard place inside active plans to record “what needs coordination” versus “what can be edited independently.”

### 재발방지 원칙

- Every active plan should include a short pre-work confirmation block that records:
  - conflict-risk files
  - independently editable files
  - the last basis used to make that judgment
- Prefer lightweight restart context over repeating full worktree analysis every session.
