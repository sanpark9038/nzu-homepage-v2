# Security

This is the short security map for agent work in this repo.

## Do Not Expose

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `OPS_DISCORD_WEBHOOK_URL`
- `SOOP_CLIENT_ID`
- any local `.env` secrets

## Operating Rules

- Never paste secrets into docs, tests, or report artifacts.
- Keep security-relevant workflow behavior in repo-visible docs.
- Prefer redacted examples when documenting commands or payloads.
- Treat webhook and service-role actions as higher-risk than local read-only work.

## Related Docs

- [README.md](../README.md)
- [docs/harness/PROJECT_SPEC.md](./harness/PROJECT_SPEC.md)
- [PIPELINE_INCIDENT_PLAYBOOK.md](../PIPELINE_INCIDENT_PLAYBOOK.md)
