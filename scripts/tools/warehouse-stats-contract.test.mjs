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
const factMatchesPath = path.join(repoRoot, "data", "warehouse", "fact_matches.csv");

function loadFreshWarehouseStats() {
  moduleCache.delete(path.normalize(warehouseStatsPath));
  return loadProjectModule(warehouseStatsPath);
}

function countReadPaths(run) {
  const originalReadFileSync = fs.readFileSync;
  const readPaths = [];
  fs.readFileSync = function readFileSyncWithAudit(filePath, ...args) {
    readPaths.push(path.normalize(String(filePath)));
    return originalReadFileSync.call(this, filePath, ...args);
  };

  try {
    run();
  } finally {
    fs.readFileSync = originalReadFileSync;
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
});

test("warehouse player detail requests load raw fact matches for detail breakdowns", () => {
  const warehouseStats = loadFreshWarehouseStats();

  const readPaths = countReadPaths(() => {
    warehouseStats.getWarehouseStats({
      from: "2026-01-01",
      to: "2026-12-31",
      playerName: "__missing_player__",
      includePlayerDetails: true,
    });
  });

  assert.equal(
    readPaths.includes(path.normalize(factMatchesPath)),
    true,
    "player detail breakdowns should still read fact_matches.csv when requested"
  );
});
