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

## Drift Guard

Do not change pipeline report generation or roster correction write semantics in this slice. If report-generation suppression is needed later, record it as follow-up.
