# AI Output Rules

`RTK` = response token saving mode.

When the user says `RTK`, follow these rules unless they explicitly override them:

1. Write only the minimum needed.
2. No intro, no outro, no filler.
3. Prefer short paragraphs over long explanations.
4. Use bullets only if the content is naturally list-shaped.
5. For review/check results:
   - facts only
   - no guessing
   - include file paths when relevant
   - exclude already fixed issues
6. Add a short summary only when useful.
7. If one sentence is enough, use one sentence.

This file is a reference rule, not an automatic system instruction.
