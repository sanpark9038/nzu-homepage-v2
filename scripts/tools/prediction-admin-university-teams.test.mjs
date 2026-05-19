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

const { buildPredictionUniversityTeams } = loadProjectModule(
  path.join(repoRoot, "lib", "prediction-admin-teams.ts")
);

function makePlayer(overrides = {}) {
  return {
    id: "player-1",
    name: "Player",
    nickname: null,
    race: "T",
    tier: "S",
    university: "KU",
    ...overrides,
  };
}

test("admin prediction existing teams come from player university affiliations", () => {
  const teams = buildPredictionUniversityTeams([
    makePlayer({ id: "ku-1", name: "KU One", university: "KU" }),
    makePlayer({ id: "ku-2", name: "KU Two", university: "KU" }),
    makePlayer({ id: "jsa-1", name: "JSA One", university: "JSA" }),
    makePlayer({ id: "fa-1", name: "Free Agent", university: "FA" }),
    makePlayer({ id: "blank-1", name: "Blank", university: "" }),
  ]);

  assert.deepEqual(
    teams.map((team) => team.teamCode),
    ["JSA", "KU"]
  );
  assert.deepEqual(
    teams.map((team) => team.players.map((player) => player.id)),
    [["jsa-1"], ["ku-1", "ku-2"]]
  );
  assert.equal(teams.find((team) => team.teamCode === "FA"), undefined);
});

test("admin prediction page no longer imports tournament home team slots for existing-team options", () => {
  const source = fs.readFileSync(path.join(repoRoot, "app", "admin", "prediction", "page.tsx"), "utf8");

  assert.match(source, /buildPredictionUniversityTeams/);
  assert.doesNotMatch(source, /buildTournamentHomeTeams/);
});
