# Main AI PPT Instruction

## Role

You are the main AI responsible for producing a technical presentation draft for the NZU homepage project.

Your task is to create a PPT-ready outline and speaker draft that explains how the project currently works from a technical point of view.

The audience is an external collaborator or outside contact who needs to understand the project structure clearly from the beginning.

## Primary Source

You must use the following document as your primary source of truth:

- `docs/EXTERNAL_AI_TECH_REPORT.md`

If you need to interpret the project, do it based on that document first.

Do not invent product claims beyond what is written there.

## Core Objective

Produce a technical presentation draft that explains:

1. What this project actually is
2. Why it is more than a normal homepage
3. How the data pipeline, metadata, Supabase, and frontend are connected
4. Which parts are already mature
5. Which parts are still transitional
6. What the next logical technical priorities are

## Non-Negotiable Rules

1. Do not hallucinate missing facts.
2. Do not present incomplete features as fully production-complete.
3. Do not describe the website as a simple static homepage.
4. Explicitly explain that public pages read from validated serving data, not runtime scraping.
5. Explicitly distinguish between:
   - local metadata as source of truth
   - Supabase as serving layer
6. Describe admin and ops tooling as part of the real system, not an accidental side feature.
7. Present the live page and match/entry-board area honestly as transitional where applicable.
8. Keep the tone technical, accurate, and presentation-ready.

## Required Output

Create the following:

1. A PPT structure of 10 to 12 slides
2. A title for each slide
3. Key bullet points for each slide
4. Short speaker notes for each slide
5. A final summary slide covering:
   - current strengths
   - current limitations
   - next priorities

## Slide Design Logic

The slide order should roughly follow this narrative:

1. Project definition
2. Why this is not just a homepage
3. System architecture
4. Data flow from collection to serving
5. Metadata and identity structure
6. Public website serving model
7. Admin and operations model
8. Automation and GitHub Actions workflow
9. Mature areas vs transitional areas
10. Next technical priorities

## Writing Requirements

1. Keep the material understandable to a non-developer audience.
2. However, do not flatten the technical content into vague business language.
3. Avoid marketing-style exaggeration.
4. Make each slide structurally clear.
5. Favor architectural explanation over decorative wording.

## Output Format

Write your answer in this order:

1. Slide table of contents
2. Slide-by-slide detailed draft
3. Final section:
   `Five critical messages that must not be distorted in the PPT`

## Final Reminder

This project should be framed as:

`a data-driven web platform built from a local ingestion and validation pipeline, a Supabase serving layer, a Next.js frontend, and internal admin/ops tooling`

Do not reduce it to a simple team introduction site.

