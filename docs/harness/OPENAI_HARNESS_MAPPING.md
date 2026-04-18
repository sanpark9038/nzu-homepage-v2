# OpenAI Harness Engineering Mapping

Source analyzed:

- OpenAI, "하네스 엔지니어링: 에이전트 우선 세계에서 Codex 활용하기", published February 11, 2026
- Official URL: https://openai.com/ko-KR/index/harness-engineering/

## Key ideas from the article

The article emphasizes a few ideas that matter directly for this repository:

1. Humans steer and agents execute.
2. Large monolithic instructions decay quickly; a short map plus structured docs works better.
3. Repository-visible knowledge is the only reliable knowledge for agents.
4. Strong constraints and predictable structure improve agent reliability.
5. Feedback loops, linters, and recurring cleanup matter more than heroic prompting.
6. Entropy must be handled continuously with explicit "golden rules."

## What that means for this repo

This project is not a greenfield agent-generated product. It is a live Next.js site plus a data/ops pipeline that already has working conventions, historical docs, and operational scars.

That changes how we should apply harness engineering here.

We should not:

- replace all current docs with a brand-new doctrine
- introduce a giant root-level handbook
- overfit the structure to a generic software template

We should:

- preserve the current repo layout
- add a dedicated harness layer inside `docs/`
- encode real pipeline rules where false conclusions currently happen
- make run recovery and failure triage resumable by any future AI

## Recommended adaptation for NZU homepage

### 1. Short entry points, deeper linked docs

Keep:

- `README.md` as repo overview
- `docs/README.md` as active docs index

Add:

- `docs/harness/` as the agent-first knowledge layer

Reason:

This follows the article's "map, not encyclopedia" principle without forcing a total repo rewrite.

### 2. Convert hidden operational knowledge into repo artifacts

For this project, the most dangerous hidden knowledge is not UI taste. It is pipeline semantics:

- when a roster move is explicit versus inferred
- what "collect-only" really means
- which alerts are advisory versus authoritative
- which teams or players are allowlisted
- when Supabase is source of serving truth versus local metadata

Those rules should live in versioned markdown and, where possible, code-level checks.

### 3. Treat false data moves as harness failures, not just data bugs

The `빡재TV` case is a harness problem because the system allowed:

- incomplete team observation
- aggressive FA fallback
- a human-facing Discord message that looked definitive

The issue was not just "bad scrape data."
The harness failed to separate:

- observed fact
- fallback inference
- publishable conclusion

### 4. Define hard boundaries around inference

For this repo, the highest-value boundary is:

- explicit roster observation
- fallback reconstruction
- public notification

If these are not separated, a partial scrape becomes a false fact.

### 5. Make ongoing cleanup normal

The article's "entropy and garbage collection" section maps well to this repo.

This project already has:

- archived docs
- evolving pipeline scripts
- operational memos
- allowlists and overrides

So the right move is a recurring lightweight cleanup process:

- stale-doc review
- pipeline rule drift review
- false-positive postmortem capture
- execution plan archiving

## Proposed minimal harness structure

```text
docs/
  README.md
  harness/
    README.md
    OPENAI_HARNESS_MAPPING.md
    CORE_BELIEFS.md
    RELIABILITY_RULES.md
    FAILURE_MODES.md
    PROJECT_SPEC.md
    exec-plans/
      active/
      completed/
    references/
```

## Why this structure fits this repo

- It is additive, not disruptive.
- It keeps the current docs usable.
- It gives future AI sessions a stable entry point.
- It captures pipeline-specific reasoning instead of generic agent theory.
- It creates a home for postmortems like the `빡재TV` incident.

## Next harness steps after this doc layer

The next step should not be broad refactoring.

The next step should be targeted guardrails:

1. label fallback-driven affiliation changes separately from confirmed changes
2. add tests for "missing from team scrape but not confirmed FA"
3. add a publish rule that blocks definitive Discord wording for inferred moves
4. add a recovery checklist for new sessions and incident triage
