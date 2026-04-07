# Current System Problems

## Purpose

This document summarizes the current technical problems of the NZU homepage system.

It is written so the content can be converted into:

1. a PPT slide
2. an infographic
3. a technical consultation brief

## 1. Summary

The project direction is correct, but subsystem completeness is uneven.

In simple terms:

1. the architecture is stronger than the current product completeness
2. player-centered serving is ahead of match-centered serving
3. admin and pipeline concepts are better defined than some public-facing features
4. the system has clear strengths, but also clear integration gaps

## 2. Main Problem Areas

### Problem A. Serving-layer data is incomplete

Current known state:

1. `players` is synced and usable
2. `matches` is not ready for full public use
3. `eloboard_matches` is not ready for full public use

Impact:

1. player-centric pages can work
2. match-driven pages are still limited
3. product readiness differs by page

Why this matters:

The public product looks broader than the actual serving data currently supports.

## 3. Problem B. Match-driven surfaces are ahead of backend completion

Examples:

1. `/match`
2. `/entry`
3. `/live`
4. some match/history-oriented sections

Current issue:

1. UI direction exists
2. but backend data flow is not fully connected
3. some areas are still mock, placeholder, or prototype-oriented

Impact:

1. the user-facing system appears more complete than the connected backend really is
2. the next phase requires workflow design, not only UI refinement

## 4. Problem C. Live integration is transitional

Current live behavior is only partially real.

Observed structure:

1. live state references player data
2. viewer metrics are mocked
3. future external API integration is implied but not fully implemented

Impact:

1. the live page is present
2. but it is not yet a fully trustworthy real-time product surface

## 5. Problem D. Analytics architecture is hybrid

Current analytics/ops data is split between:

1. Supabase serving tables
2. local warehouse CSV files
3. local reports and exports

Impact:

1. architecture is harder to explain
2. operational complexity increases
3. long-term maintenance direction is still undecided

Core question:

Should analytics remain hybrid, become more DB-centric, or be separated more explicitly?

## 6. Problem E. Admin auth is still minimal

Current auth model:

1. single access key
2. cookie session
3. route protection via proxy

Impact:

1. acceptable for internal use
2. weak for multi-operator or expanded team access
3. not ideal for long-term growth

## 7. Problem F. Build and environment reproducibility is not fully stable

Documented issue:

1. local environment could reproduce `spawn EPERM`
2. remote/agent environment could still build successfully

Impact:

1. collaboration reliability is reduced
2. build trust across environments is not fully normalized
3. external contributors may hit inconsistent behavior

## 8. Problem G. Operational safety exists, but complexity is high

This is a mixed situation.

Strength:

1. collection and serving sync are separated
2. approval and validation barriers exist
3. accidental production writes are guarded against

Problem:

1. operations require multiple reports, snapshots, alerts, and checks
2. the system is safer, but harder to operate casually

Impact:

1. good safety posture
2. higher maintenance and onboarding cost

## 9. What These Problems Mean Structurally

The core issue is not bad architecture.

The core issue is that the system currently has:

1. a solid backbone
2. a partially complete serving layer
3. strong operational intent
4. but unresolved integration boundaries

This means the next stage is not just "more coding."

It requires architectural decisions in these areas:

1. serving completeness
2. live-data strategy
3. match workflow model
4. analytics storage strategy
5. admin/auth scaling model

## 10. Best One-Line Explanation

The current system problem can be summarized like this:

`The backbone is already designed, but several user-facing and analytical layers are still only partially connected to that backbone.`

## 11. Recommended Use In Presentation

If this is converted into PPT or infographic form, the best structure is:

1. What already works well
2. What is only partially connected
3. Why that gap matters
4. What kind of expert help is needed

