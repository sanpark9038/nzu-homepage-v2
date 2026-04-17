# HOSAGA Admin Routes

This document summarizes the current purpose of each `admin` route.

| Route | Purpose | Notes |
| --- | --- | --- |
| `/admin/ops` | Pipeline status and operator checks | Review freshness, alerts, and pipeline health before any manual action. |
| `/admin/roster` | Team roster operations | Inspect and adjust roster-facing data after validated pipeline updates. |
| `/admin/prediction` | Prediction and match voting admin | Manage prediction inputs and review current match-voting state. |
| `/admin/rankings` | Ranking admin tools | Review ranking-related serving data and admin-side adjustments. |
| `/admin/data-lab` | Internal data inspection | Use for low-level data checks, QA, and debugging support. |
| `/admin/match` | Match operation entry | Create or update match-facing operational records. |
| `/admin/login` | Admin authentication | Entry point for authenticated admin access. |
