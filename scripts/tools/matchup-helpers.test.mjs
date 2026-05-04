import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const moduleCache = new Map();

function resolveProjectModule(specifier, fromPath) {
  if (!specifier.startsWith(".")) return null;

  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function loadProjectModule(filePath) {
  const absolutePath = path.normalize(filePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached.exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  });

  const localRequire = (specifier) => {
    const resolvedProjectModule = resolveProjectModule(specifier, absolutePath);
    if (resolvedProjectModule) return loadProjectModule(resolvedProjectModule);
    return require(specifier);
  };

  const runModule = vm.runInThisContext(
    `(function(require, module, exports, __dirname, __filename) {\n${outputText}\n})`,
    { filename: absolutePath }
  );
  runModule(localRequire, module, module.exports, path.dirname(absolutePath), absolutePath);
  return module.exports;
}

const {
  buildH2HCacheKey,
  buildH2HQueryParams,
  filterMatchupPlayers,
  getMatchupTierBadgeLetter,
  getMatchupTierKey,
  getSharedMatchupGender,
  mapPlayerToMatchupSummary,
  mapPlayersToMatchupSummaries,
  normalizeMatchupSearchText,
} = loadProjectModule(path.join(repoRoot, "lib", "matchup-helpers.ts"));

test("mapPlayerToMatchupSummary preserves nullable fields and defaults race/tier", () => {
  const summary = mapPlayerToMatchupSummary({
    id: "p1",
    name: "alpha",
    race: null,
    gender: null,
    tier: null,
    university: null,
  });

  assert.deepEqual(summary, {
    id: "p1",
    name: "alpha",
    nickname: null,
    race: "R",
    gender: null,
    tier: "미정",
    university: null,
  });
});

test("mapPlayersToMatchupSummaries keeps one shared public contract", () => {
  const summaries = mapPlayersToMatchupSummaries([
    {
      id: "p1",
      name: "alpha",
      race: "Terran",
      gender: "male",
      tier: "1",
      university: "B.A",
    },
    {
      id: "p2",
      name: "beta",
      race: "",
      gender: null,
      tier: null,
      university: null,
    },
  ]);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.race, "Terran");
  assert.equal(summaries[1]?.race, "R");
  assert.equal(summaries[1]?.tier, "미정");
  assert.equal(summaries[1]?.university, null);
});

test("shared gender only applies when both sides match", () => {
  assert.equal(getSharedMatchupGender({ gender: "female" }, { gender: "female" }), "female");
  assert.equal(getSharedMatchupGender({ gender: "female" }, { gender: "male" }), "");
  assert.equal(getSharedMatchupGender({ gender: "female" }, { gender: null }), "");
});

test("buildH2HQueryParams includes gender only for same-gender matchups", () => {
  const shared = buildH2HQueryParams(
    { name: "alpha", gender: "female" },
    { name: "beta", gender: "female" }
  );
  assert.equal(shared.get("gender"), "female");
  assert.equal(shared.get("p1"), "alpha");
  assert.equal(shared.get("p2"), "beta");

  const mixed = buildH2HQueryParams(
    { name: "alpha", gender: "female" },
    { name: "beta", gender: "male" }
  );
  assert.equal(mixed.has("gender"), false);
});

test("buildH2HCacheKey remains stable for nullable genders", () => {
  assert.equal(
    buildH2HCacheKey(
      { id: "left", gender: null },
      { id: "right", gender: null }
    ),
    "left:right:all"
  );

  assert.equal(
    buildH2HCacheKey(
      { id: "left", gender: "female" },
      { id: "right", gender: "female" }
    ),
    "left:right:female"
  );
});

test("normalizeMatchupSearchText trims and lowercases", () => {
  assert.equal(normalizeMatchupSearchText("  TeSt  "), "test");
});

test("filterMatchupPlayers applies shared university, query, and exclusion rules", () => {
  const players = [
    { id: "1", name: "alpha", race: "P", gender: "female", tier: "1", university: "B.A" },
    { id: "2", name: "alpine", race: "T", gender: "female", tier: "2", university: "B.A" },
    { id: "3", name: "beta", race: "T", gender: "male", tier: "UNKNOWN", university: "HM" },
  ];

  assert.deepEqual(
    filterMatchupPlayers(players, { university: "B.A", query: "alp" }).map((player) => player.id),
    ["1", "2"]
  );

  assert.deepEqual(
    filterMatchupPlayers(players, { query: "alp", excludePlayerId: "2" }).map((player) => player.id),
    ["1"]
  );
});

test("tier helpers stay safe for nullable values", () => {
  assert.equal(getMatchupTierKey(null), "미정");
  assert.equal(getMatchupTierBadgeLetter(null), "?");
  assert.equal(getMatchupTierBadgeLetter("GOD"), "G");
  assert.equal(getMatchupTierBadgeLetter("KING"), "K");
  assert.equal(getMatchupTierBadgeLetter("3"), "3");
});
