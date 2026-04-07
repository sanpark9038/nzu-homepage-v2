# UI/UX Redesign: Readability-First Minimalism (Phase 4.1)

This plan corrects the previous "high-density" approach which caused readability issues. We are shifting to a **Korean-centric, accessible, and clean minimal design** as requested by CEO Sanpark.

## User Review Required

> [!IMPORTANT]
> - **Font Reset**: All `text-[9px]`, `text-[10px]`, and `text-[11px]` will be increased to at least `text-xs (12px)` or `text-sm (14px)`.
> - **Localization**: English labels like `pts`, `WIN RATE`, `MATCH LOGS` will be restored to Korean (`점`, `승률`, `최근 전적` 등).
> - **Contrast**: Background/text contrast will be improved by reducing excessive transparency in dark mode.

## Proposed Changes

### [Global] Spacing & Typography
- [MODIFY] [globals.css](file:///c:/Users/NZU/Desktop/nzu-homepage/app/globals.css):
  - Increase base line-height for better legibility.
  - Tone down decorative `uppercase` and `tracking-widest` for body text.

### [Players] List & Grid Optimization
- [MODIFY] [nzu-badges.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/ui/nzu-badges.tsx): Restore Korean labels for Race and Tier. Increase padding.
- [MODIFY] [PlayerRow.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/players/PlayerRow.tsx):
  - Increase font sizes for ELO and Record (9px -> 12px+).
  - Use Korean for labels ("승", "패", "점").
- [MODIFY] [TierGroup.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/players/TierGroup.tsx): Restore Korean tier grouping labels.

### [Battle Tools] Full Redesign Cleanup
- [MODIFY] [TierRow.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/battle-grid/TierRow.tsx): Clean up the "Spine" design, ensure Korean labels, and fix font sizes.
- [MODIFY] [BattleGrid.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/battle-grid/BattleGrid.tsx): Simplify the layout for better mobile/desktop responsiveness.
- [MODIFY] [H2HLookup.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/components/stats/H2HLookup.tsx): 
  - Remove "Cyber-Mechanic" English labels.
  - Scale up the result display for better readability.
  - Fix font sizes in the player lists and match history.

### [Misc] Header & Landing
- [MODIFY] [app/page.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/app/page.tsx): Reset Hero section fonts to be readable, not just "compact".
- [MODIFY] [app/entry/page.tsx](file:///c:/Users/NZU/Desktop/nzu-homepage/app/entry/page.tsx): Restore Korean headers.

## Verification Plan

### Automated Tests
- `npm run build` directly via agent env to confirm zero syntax errors.

### Manual Verification
- **Font Audit**: Check every component for `text-[<12px]` and remove.
- **Language Audit**: All critical UI labels must be in Korean.
- **Responsiveness**: Verify that larger fonts don't break layouts on mobile.
- **Contrast Check**: Ensure text is clearly legible against dark glass backgrounds.

