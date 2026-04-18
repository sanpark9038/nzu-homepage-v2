# Frontend

This is the short frontend map for the public website.

## Primary Areas

- `app/`: App Router pages and route segments
- `components/`: reusable UI components
- `lib/`: shared loaders, helpers, and data-facing logic

## Current Frontend Rule

The public site should read from serving data instead of runtime scraping.

If a UI change depends on roster or match truth, check:

- [RELIABILITY.md](./RELIABILITY.md)
- [../PIPELINE_DATA_CONTRACT.md](../PIPELINE_DATA_CONTRACT.md)
