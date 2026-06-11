# Tier Query Shell Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/tier?...` URLs reuse the cacheable `/tier` shell while preserving correct first-load filters and full-list behavior.

**Architecture:** Remove only the tier query rewrite from `proxy.ts`; keep `/board` and `/player` query rewrites unchanged. Let the client tier shell read `window.location.search` during initial state setup so query URLs request the correct `/api/tier/players?...` endpoint without dynamic server rendering.

**Tech Stack:** Next.js App Router, `proxy.ts`, React client state, existing Node contract tests.

---

### Task 1: Lock The Routing Contract

**Files:**
- Modify: `scripts/tools/tier-page-cache-contract.test.js`
- Modify: `proxy.ts`

- [x] **Step 1: Write the failing contract**

Add assertions to `scripts/tools/tier-page-cache-contract.test.js` that the tier proxy rewrite and `/tier` query matchers are gone:

```js
assert.doesNotMatch(proxySource, /pathname === "\/tier"/);
assert.doesNotMatch(proxySource, /\/tier\/query/);
assert.doesNotMatch(proxySource, /source:\s*["']\/tier["']/);
assert.doesNotMatch(proxySource, /type:\s*["']query["'],\s*key:\s*["']liveOnly["']/);
assert.doesNotMatch(proxySource, /type:\s*["']query["'],\s*key:\s*["']univ["']/);
```

- [x] **Step 2: Run the contract and verify it fails**

Run: `npm.cmd run test:tier-page-cache-contract`

Expected: FAIL because `proxy.ts` still rewrites `/tier?...` to `/tier/query`.

- [x] **Step 3: Remove only the tier rewrite**

Delete the `/tier` branch from `proxy(req)` and remove the six `/tier` query matchers from `config.matcher`. Do not change `/board`, `/player`, `/admin`, or `/api/admin` proxy behavior.

- [x] **Step 4: Run the contract and verify it passes**

Run: `npm.cmd run test:tier-page-cache-contract`

Expected: PASS.

### Task 2: Preserve First Query Read

**Files:**
- Modify: `scripts/tools/tier-page-cache-contract.test.js`
- Modify: `app/tier/TierClientView.tsx`

- [x] **Step 1: Write the failing client contract**

Add assertions that `TierClientView` initializes its active query from the browser location, not only from the server prop:

```js
assert.match(clientViewSource, /useState\(\(\) => readBrowserQueryString\(queryString\)\)/);
assert.match(clientViewSource, /const syncFromLocation = \(\) => setActiveQueryString\(readBrowserQueryString\(queryString\)\)/);
```

- [x] **Step 2: Run the contract and verify it fails**

Run: `npm.cmd run test:tier-page-cache-contract`

Expected: FAIL because `useState(queryString)` is still used.

- [x] **Step 3: Change initial state**

Change the initial state in `app/tier/TierClientView.tsx` to:

```tsx
const [activeQueryString, setActiveQueryString] = useState(() => readBrowserQueryString(queryString));
```

Keep the existing `syncFromLocation`, `popstate`, and `tier-filter-query-change` handling.

- [x] **Step 4: Run the contract and verify it passes**

Run: `npm.cmd run test:tier-page-cache-contract`

Expected: PASS.

### Task 3: Verify Build And Runtime Behavior

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md`

- [x] **Step 1: Run focused verification**

Run:

```powershell
npm.cmd run test:tier-page-cache-contract
npm.cmd run test:tier-page-helpers
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run production-like smoke**

Start `next start` on a free local port after `npm.cmd run build`. Visit `/tier?liveOnly=false` and verify the first tier API request includes `liveOnly=false` and the rendered root has `data-tier-live-only="false"`. If the local environment cannot keep a reachable `next start` server open, use the Vercel preview or production deployment for this smoke check.

- [x] **Step 3: Record the result**

Append a short note to `docs/harness/exec-plans/active/2026-05-01-public-page-performance.md` with the reason, changed routing contract, and verification commands.
