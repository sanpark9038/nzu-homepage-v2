# Docs Index

This folder is the entry point for living documentation.

## Active Docs

- [README.md](../README.md): repo entry and current architecture summary
- [PIPELINE_ONE_PAGE.md](../PIPELINE_ONE_PAGE.md): short operational overview
- [PIPELINE_SUCCESS_CRITERIA.md](../PIPELINE_SUCCESS_CRITERIA.md): release and pipeline acceptance bar
- [PIPELINE_INCIDENT_PLAYBOOK.md](../PIPELINE_INCIDENT_PLAYBOOK.md): incident response guide
- [TOMORROW_RUNBOOK.md](../TOMORROW_RUNBOOK.md): day-to-day runbook
- [PIPELINE_DATA_CONTRACT.md](../PIPELINE_DATA_CONTRACT.md): serving contract for current and future sites
- [data/metadata/README.md](../data/metadata/README.md): reusable metadata contract
- [DOCS_CLEANUP_PLAN.md](../DOCS_CLEANUP_PLAN.md): cleanup sequencing and archive policy
- [archive/README.md](./archive/README.md): archived handoffs, reviews, and one-off notes
- [screenshots/README.md](./screenshots/README.md): local screenshot policy for ad hoc captures

## Archive Policy

Historical handoff, review, and one-off planning notes should move under `docs/archive/`.

Do not delete those files until:

1. the current homepage consumes the serving contract cleanly
2. the pipeline-to-Supabase sync path is verified
3. no active doc still depends on the historical note

## Working Rule

If a new document changes current operating behavior, keep it in the root only while it is active.

Once the behavior is folded into an active doc, move the temporary memo to `docs/archive/`.
