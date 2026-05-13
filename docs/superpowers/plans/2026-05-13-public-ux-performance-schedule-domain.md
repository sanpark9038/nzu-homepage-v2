# Public UX Performance Schedule Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the highest measured public-page bottleneck first, then clean up public schedule readiness and domain connection evidence without changing locked labels or writing production data.

**Architecture:** Keep `/tier` as the full-list default, but replace the heavy tier-grid `PlayerCard` hydration path with a tier-specific lightweight card plus a tiny client quick-add button that dispatches the existing H2H event contract. Keep `/schedule` data cleanup separate from `/tier` so rollback can restore one slice without touching the other. Treat `star-hosaga.com` connection as an ops checklist first, because Vercel/DNS changes are not repo code.

**Tech Stack:** Next.js App Router, React Server Components, focused Node contract tests, Vercel production smoke checks, agent-browser desktop/mobile verification.

---

## RB Criteria

- Do not write production data.
- Preserve locked visible labels and the `/tier` navigation target.
- If a focused test fails outside the current slice, stop before widening scope.
- Commit boundaries:
  - Commit 1: audit/plan docs only.
  - Commit 2: `/tier` lightweight card and contracts.
  - Commit 3: `/schedule` public fixture cleanup, if reached today.
  - Domain connection remains an operator checklist unless the operator explicitly approves Vercel/DNS changes.
- Rollback:
  - Revert `/tier` files to restore the previous card rendering path.
  - Revert schedule metadata or schedule page filtering to restore prior schedule output.
  - Do not revert unrelated pipeline commits.

## Files

- Modify: `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`
- Modify: `app/tier/page.tsx`
- Modify: `components/players/TierGroup.tsx`
- Modify: `components/players/TeamTierCompactGrid.tsx`
- Modify: `components/players/H2HSelectorBar.tsx`
- Create: `components/players/TierPlayerCard.tsx`
- Create: `components/players/TierQuickH2HButton.tsx`
- Modify: `scripts/tools/tier-page-cache-contract.test.js`
- Modify: `scripts/tools/tier-page-helpers.test.cjs` only if helper behavior changes
- Modify: `app/schedule/page.tsx` in the schedule slice
- Modify: `data/metadata/tournament_prediction_matches.v1.json` only if removing fixture data is chosen
- Create or modify: a focused schedule contract test under `scripts/tools/`

## Task 1: Baseline Docs Commit

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`
- Create: `docs/superpowers/plans/2026-05-13-public-ux-performance-schedule-domain.md`

- [ ] **Step 1: Review the diff**

Run:

```powershell
git diff -- docs/harness/exec-plans/active/2026-05-01-public-page-performance.md docs/superpowers/plans/2026-05-13-public-ux-performance-schedule-domain.md
```

Expected: only audit evidence and this implementation plan.

- [ ] **Step 2: Verify whitespace**

Run:

```powershell
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 3: Commit docs only**

Run:

```powershell
git add docs/harness/exec-plans/active/2026-05-01-public-page-performance.md docs/superpowers/plans/2026-05-13-public-ux-performance-schedule-domain.md
git commit -m "Document public UX baseline plan"
```

Expected: one docs commit.

## Task 2: Tier Lightweight Card Contract

**Files:**
- Modify: `scripts/tools/tier-page-cache-contract.test.js`

- [ ] **Step 1: Write the failing contract**

Add assertions that:

```js
const tierGroupSource = readProjectFile("components/players/TierGroup.tsx");
const teamGridSource = readProjectFile("components/players/TeamTierCompactGrid.tsx");
const h2hSource = readProjectFile("components/players/H2HSelectorBar.tsx");

assert.match(tierGroupSource, /TierPlayerCard/);
assert.doesNotMatch(tierGroupSource, /<PlayerCard/);
assert.match(teamGridSource, /TierPlayerCard/);
assert.doesNotMatch(teamGridSource, /<PlayerCard/);
assert.match(h2hSource, /MatchupPlayerSummary/);
```

- [ ] **Step 2: Run the red test**

Run:

```powershell
npm.cmd run test:tier-page-cache-contract
```

Expected: FAIL because `TierGroup.tsx` and `TeamTierCompactGrid.tsx` still render `PlayerCard`.

## Task 3: Tier Lightweight Card Implementation

**Files:**
- Create: `components/players/TierQuickH2HButton.tsx`
- Create: `components/players/TierPlayerCard.tsx`
- Modify: `components/players/TierGroup.tsx`
- Modify: `components/players/TeamTierCompactGrid.tsx`
- Modify: `components/players/H2HSelectorBar.tsx`

- [ ] **Step 1: Add the small client button**

Create `components/players/TierQuickH2HButton.tsx`:

```tsx
"use client";

import type { MatchupPlayerSummary } from "@/lib/matchup-helpers";

type TierQuickH2HButtonProps = {
  player: MatchupPlayerSummary;
};

export function TierQuickH2HButton({ player }: TierQuickH2HButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("add-h2h-player", { detail: player }));
      }}
      className="mt-auto w-full rounded-xl border border-white/10 bg-foreground/5 px-3 py-3 text-[12px] font-[900] tracking-tight text-foreground/80 transition-all hover:bg-foreground/10 hover:text-foreground"
    >
      현재 매치에 추가
    </button>
  );
}
```

- [ ] **Step 2: Add a server-rendered tier card**

Create `components/players/TierPlayerCard.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { TierBadge } from "@/components/ui/nzu-badges";
import { buildPlayerHref } from "@/lib/player-route";
import { getUniversityLabel } from "@/lib/university-config";
import { mapPlayerToMatchupSummary } from "@/lib/matchup-helpers";
import { cn, normalizeRace } from "@/lib/utils";
import { resolveSoopChannelImageUrl } from "@/lib/soop";
import type { Player } from "@/types";

import { TierQuickH2HButton } from "./TierQuickH2HButton";

type TierPlayerCardProps = {
  player: Player;
  className?: string;
};

export function TierPlayerCard({ player, className }: TierPlayerCardProps) {
  const race = normalizeRace(player.race);
  const profileUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const universityLabel = getUniversityLabel(player.university);
  const matchupPlayer = mapPlayerToMatchupSummary(player);

  return (
    <article className={cn("relative flex w-full max-w-52 flex-col rounded-2xl border-[3px] border-white/10 bg-card transition-colors hover:border-nzu-green/50", className)}>
      <Link href={buildPlayerHref(player)} className="block px-5 pt-5" aria-label={`${player.name} 선수 보기`}>
        <div className="relative mx-auto h-[140px] w-[132px] overflow-hidden rounded-xl bg-muted">
          <Image src={profileUrl} alt={player.name} width={132} height={140} sizes="132px" className="h-full w-full object-cover object-top" />
          {player.is_live ? <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">LIVE</span> : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <Link href={buildPlayerHref(player)} className="min-w-0 flex-1 truncate text-[1.16rem] font-black tracking-tight text-foreground hover:text-nzu-green">
            {player.name}
          </Link>
          <RaceLetterBadge race={race} size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={player.tier || "미정"} size="xs" />
          <span className="min-w-0 flex-1 truncate rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[10px] font-[1000] tracking-tight text-white/72">
            {universityLabel}
          </span>
        </div>
        <TierQuickH2HButton player={matchupPlayer} />
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Switch tier grids to the lightweight card**

Replace `PlayerCard` imports/usages in `components/players/TierGroup.tsx` and `components/players/TeamTierCompactGrid.tsx` with `TierPlayerCard`.

- [ ] **Step 4: Narrow H2H selector type**

In `components/players/H2HSelectorBar.tsx`, import `type { MatchupPlayerSummary } from "@/lib/matchup-helpers"` and use it for `MatchSlot` and event details instead of importing `Player` from `PlayerCard`.

- [ ] **Step 5: Run green tests**

Run:

```powershell
npm.cmd run test:tier-page-cache-contract
npm.cmd run test:tier-page-helpers
npm.cmd run test:matchup-helpers
npx.cmd tsc --noEmit
```

Expected: all pass.

## Task 4: Browser And Payload Verification

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`

- [ ] **Step 1: Build locally**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js build succeeds.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: no ESLint errors.

- [ ] **Step 3: Browser check desktop and mobile**

Start the dev server, then check:

```powershell
npm.cmd run dev
agent-browser.cmd open http://localhost:3000/tier
agent-browser.cmd set viewport 390 844
agent-browser.cmd open http://localhost:3000/tier
agent-browser.cmd open http://localhost:3000/tier?liveOnly=true
agent-browser.cmd errors
```

Expected: content renders, no framework overlay, no horizontal overflow.

- [ ] **Step 4: Record measurement**

Add the before/after local or production measurement to the active plan. Include response bytes and timing for `/tier` and `/tier?liveOnly=true`.

## Task 5: Schedule Cleanup Slice

**Files:**
- Modify: `app/schedule/page.tsx`
- Modify or create: `scripts/tools/schedule-page-contract.test.js`
- Optional modify: `package.json`
- Optional modify: `data/metadata/tournament_prediction_matches.v1.json`

- [ ] **Step 1: Write a failing schedule contract**

Assert that the public schedule route source or metadata no longer exposes placeholder/test fixtures as public matches:

```js
assert.doesNotMatch(scheduleSource, /Quarterfinal Match 2 \(TEST\)/i);
assert.doesNotMatch(JSON.stringify(predictionMatches), /임시 \d+팀|TEST/i);
```

- [ ] **Step 2: Run red test**

Run:

```powershell
node scripts/tools/schedule-page-contract.test.js
```

Expected: FAIL against current fixture data.

- [ ] **Step 3: Implement minimal cleanup**

Either remove fixture matches from `data/metadata/tournament_prediction_matches.v1.json` or make `app/schedule/page.tsx` filter draft/test/placeholder rows out of the public schedule. Prefer data cleanup if the fixtures are not needed for admin demos.

- [ ] **Step 4: Verify**

Run:

```powershell
node scripts/tools/schedule-page-contract.test.js
npm.cmd run build
```

Expected: contract and build pass.

## Task 6: Domain Connection Checklist

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`

- [ ] **Step 1: Record current state**

Use existing evidence:

```text
vercel domains list: star-hosaga.com absent
Resolve-DnsName star-hosaga.com: no usable A/CNAME answer
Resolve-DnsName www.star-hosaga.com: no answer
```

- [ ] **Step 2: Add operator checklist**

Record:

```text
1. Add star-hosaga.com to Vercel project nzu-homepage-v2.
2. Add www.star-hosaga.com to the same project.
3. Run vercel domains inspect for both domains and use the exact DNS records it reports.
4. In Cloudflare, leave images.star-hosaga.com untouched, remove conflicting apex/www records, then add the exact Vercel-required apex/www records.
5. Decide canonical redirect: apex -> www or www -> apex.
6. Keep Cloudflare apex/www DNS-only at first; do not use Flexible SSL.
7. Verify with vercel domains inspect, DNS lookups, and browser checks.
8. After the domain is live, update SERVING_REVALIDATE_URL wherever serving cache revalidation is configured.
```

- [ ] **Step 3: Do not change DNS from Codex unless the operator explicitly asks**

Expected: no production DNS change in this slice.
