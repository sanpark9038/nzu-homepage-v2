# Ops Review Applied Filter

## Objective

Hide roster ops-review items that are already reflected in the current approved roster or admin correction state.

## Scope

- Server-side filtering in the admin roster ops-review helper.
- Identifier-first matching using `entity_id`, with existing manual exclusions still handled separately.
- No public navigation, labels, or roster mutation behavior changes.

## Verification

- Add/extend the admin roster ops-review contract test.
- Run the targeted ops-review test before broader checks.
- Run TypeScript/lint/build checks if the targeted test passes.

## Completion

- PR #12 `Hide applied ops-review candidates` merged to `main` on 2026-06-11.
- Production deployment became Ready after merge.
- `new_candidate` review rows are suppressed when their durable `entity_id`
  already exists in the approved roster baseline or when the identity is
  already in collection exclusion state.
- Affiliation, tier, and race mismatch rows keep value-specific suppression.

Verified:

- `npm.cmd run test:admin-roster-ops-review`
- `npx.cmd tsc --noEmit --incremental false`
- `npm.cmd run lint`
- `git diff --check`
- `npm.cmd run build`
- Production unauthenticated smoke:
  - `/admin/roster/ops-review` returns 307 to admin login.
  - `/api/admin/roster/ops-review` returns 401 `admin auth required`.

## Drift Guard

Do not change pipeline report generation or roster correction write semantics in this slice. If report-generation suppression is needed later, record it as follow-up.
