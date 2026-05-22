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
  if (specifier.startsWith("@/")) {
    const basePath = path.join(repoRoot, specifier.slice(2));
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
  }

  if (!specifier.startsWith(".")) return null;
  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`];
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

const warehouseStatsPath = path.join(repoRoot, "lib", "warehouse-stats.ts");
const warehouseRoutePath = path.join(repoRoot, "app", "api", "stats", "warehouse", "route.ts");
const factMatchesPath = path.join(repoRoot, "data", "warehouse", "fact_matches.csv");
const aggPlayerPath = path.join(repoRoot, "data", "warehouse", "agg_daily_player.csv");
const aggTeamPath = path.join(repoRoot, "data", "warehouse", "agg_daily_team.csv");
const aggPlayerDetailsPath = path.join(repoRoot, "data", "warehouse", "agg_player_detail_breakdowns.csv");

function loadFreshWarehouseStats() {
  moduleCache.delete(path.normalize(warehouseStatsPath));
  return loadProjectModule(warehouseStatsPath);
}

function countReadPaths(run, fixtures = new Map(), missingPaths = new Set()) {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalStatSync = fs.statSync;
  const readPaths = [];
  fs.existsSync = function existsSyncWithFixtures(filePath) {
    const normalizedPath = path.normalize(String(filePath));
    if (missingPaths.has(normalizedPath)) return false;
    if (fixtures.has(normalizedPath)) return true;
    return originalExistsSync.call(this, filePath);
  };
  fs.statSync = function statSyncWithFixtures(filePath, ...args) {
    const normalizedPath = path.normalize(String(filePath));
    if (missingPaths.has(normalizedPath)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${normalizedPath}'`), { code: "ENOENT" });
    }
    if (fixtures.has(normalizedPath)) {
      return { mtimeMs: 1, isFile: () => true };
    }
    return originalStatSync.call(this, filePath, ...args);
  };
  fs.readFileSync = function readFileSyncWithAudit(filePath, ...args) {
    const normalizedPath = path.normalize(String(filePath));
    readPaths.push(normalizedPath);
    if (fixtures.has(normalizedPath)) return fixtures.get(normalizedPath);
    return originalReadFileSync.call(this, filePath, ...args);
  };

  try {
    run();
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    fs.statSync = originalStatSync;
  }

  return readPaths;
}

test("warehouse overview requests avoid loading raw fact matches", () => {
  const warehouseStats = loadFreshWarehouseStats();

  const readPaths = countReadPaths(() => {
    warehouseStats.getWarehouseStats({
      from: "2026-01-01",
      to: "2026-12-31",
      includeDaily: true,
      includePlayerDetails: false,
    });
  });

  assert.equal(
    readPaths.includes(path.normalize(factMatchesPath)),
    false,
    "overview-only warehouse stats should not synchronously read fact_matches.csv"
  );
  assert.equal(
    readPaths.includes(path.normalize(aggPlayerDetailsPath)),
    false,
    "overview-only warehouse stats should not synchronously read player detail aggregates"
  );
});

test("warehouse player detail requests use aggregate detail snapshots instead of raw facts", () => {
  const warehouseStats = loadFreshWarehouseStats();
  const fixtures = new Map([
    [
      path.normalize(factMatchesPath),
      "match_key,match_date,player_entity_id,player_name,team,tier,race,opponent_entity_id,opponent_name,opponent_race,map_name,result,is_win,memo,source_file,source_row_no,ingested_at\n",
    ],
    [
      path.join(repoRoot, "data", "warehouse", "agg_daily_player.csv"),
      "match_date,player_entity_id,player_name,team,tier,race,matches,wins,losses,win_rate\n",
    ],
    [
      path.join(repoRoot, "data", "warehouse", "agg_daily_team.csv"),
      "match_date,team,matches,wins,losses,win_rate,unique_players\n",
    ],
    [
      path.normalize(aggPlayerDetailsPath),
      "match_date,player_entity_id,player_name,team,breakdown_type,breakdown_value,matches,wins,losses,win_rate\n",
    ],
  ]);

  const readPaths = countReadPaths(() => {
    warehouseStats.getWarehouseStats({
      from: "2026-01-01",
      to: "2026-12-31",
      playerName: "__missing_player__",
      includePlayerDetails: true,
    });
  }, fixtures);

  assert.equal(
    readPaths.includes(path.normalize(factMatchesPath)),
    false,
    "player detail breakdowns should not synchronously read fact_matches.csv"
  );
  assert.equal(
    readPaths.includes(path.normalize(aggPlayerDetailsPath)),
    true,
    "player detail breakdowns should read the pre-aggregated detail snapshot"
  );
});

test("warehouse serving health accepts aggregate snapshots without raw fact source", () => {
  const warehouseStats = loadFreshWarehouseStats();
  const fixtures = new Map([
    [path.normalize(aggPlayerPath), "match_date,player_entity_id,player_name,team,tier,race,matches,wins,losses,win_rate\n"],
    [path.normalize(aggTeamPath), "match_date,team,matches,wins,losses,win_rate,unique_players\n"],
    [
      path.normalize(aggPlayerDetailsPath),
      "match_date,player_entity_id,player_name,team,breakdown_type,breakdown_value,matches,wins,losses,win_rate\n",
    ],
  ]);

  let health = null;
  countReadPaths(() => {
    health = warehouseStats.warehouseDataHealth();
  }, fixtures, new Set([path.normalize(factMatchesPath)]));

  assert.equal(health.rawFactExists, false, "raw fact CSV should be tracked separately from serving readiness");
  assert.equal(health.servingReady, true, "aggregate snapshots should be enough for warehouse stats serving");
  assert.equal(health.exists, false, "legacy all-files health should still reflect raw fact absence");
});

test("warehouse stats API gates runtime serving on aggregate readiness", () => {
  const source = fs.readFileSync(warehouseRoutePath, "utf8");
  assert.match(source, /health\.servingReady/);
  assert.doesNotMatch(source, /if\s*\(\s*!health\.exists\s*\)/);
});
