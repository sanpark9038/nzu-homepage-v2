# HOSAGA Expert Help Brief

Use this brief when explaining the HOSAGA system to an external engineer.

## System Summary

HOSAGA is a data-driven site backed by:

- source scraping and roster collection tools
- local metadata validation and normalization
- Supabase serving tables
- internal admin and ops workflows

## What Matters Most

- runtime scraping is avoided on the public site
- pipeline validation is part of the serving contract
- roster and identity data are intentionally separated
- production sync must remain explicit and audited
