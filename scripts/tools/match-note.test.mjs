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

const { classifyMatchNote, getDisplayNote } = loadProjectModule(
  path.join(repoRoot, "lib", "match-note.ts")
);

test("classifyMatchNote tags mini matches", () => {
  assert.equal(classifyMatchNote("신세계 vs BGM 미니대전(2)"), "mini");
  assert.equal(classifyMatchNote("[미니대전] 엠비대 VS BGM 1경기"), "mini");
});

test("classifyMatchNote tags university matches, including 미니대학대전", () => {
  assert.equal(classifyMatchNote("JSAvs늪지대 미니대학대전 1세트 2경기"), "uni");
  assert.equal(classifyMatchNote("흑카데미 vs 늪지대 미니 대학대전 1-5/3(2)"), "uni");
});

test("classifyMatchNote tags tournaments", () => {
  assert.equal(classifyMatchNote("정선컵 3-4티어 대회 16강"), "tourney");
  assert.equal(classifyMatchNote("JPL 시즌2 YBvs와플대 1경기"), "tourney");
  assert.equal(classifyMatchNote("네버스타워즈 HMvsBGM 2SET (4),HM 우승"), "tourney");
});

test("classifyMatchNote excludes scrims even when they name a cup", () => {
  assert.equal(classifyMatchNote("오염컵 스크림 4경기"), null);
});

test("classifyMatchNote excludes leagues by requirement", () => {
  assert.equal(classifyMatchNote("K리그 1세트 4경기"), null);
  assert.equal(classifyMatchNote("메이저 프로리그 2세트 위너스 2경기"), null);
});

test("classifyMatchNote returns null for casual and empty notes", () => {
  assert.equal(classifyMatchNote("단판"), null);
  assert.equal(classifyMatchNote("3/2"), null);
  assert.equal(classifyMatchNote(""), null);
  assert.equal(classifyMatchNote(null), null);
  assert.equal(classifyMatchNote(undefined), null);
});

test("getDisplayNote drops noise-only notes", () => {
  // 낱자모만 있는 값도 노이즈다 (실데이터 1,754행)
  for (const noise of ["1", "2", "3/2", "3/2(2)", ".", "ㅇ", "32", "--1", "   ", "", null, undefined, "ㅇㅇ", "ㄷㄱ", "1 ㅇㅇ", ",ㅡ"]) {
    assert.equal(getDisplayNote(noise), null, `expected null for ${JSON.stringify(noise)}`);
  }
});

test("getDisplayNote keeps meaningful notes", () => {
  assert.equal(getDisplayNote("단판"), "단판");
  assert.equal(getDisplayNote("스폰"), "스폰");
  assert.equal(getDisplayNote("3/2 1경기"), "3/2 1경기");
  assert.equal(getDisplayNote("K리그 1세트 4경기"), "K리그 1세트 4경기");
  assert.equal(getDisplayNote("  단판  "), "단판");
});

test("getDisplayNote keeps only the first line of multiline analysis logs", () => {
  assert.equal(
    getDisplayNote("JSA vs HM 미니대전 5판3선 4SET\n초반 빌드 분석\n중반 운영 메모"),
    "JSA vs HM 미니대전 5판3선 4SET"
  );
  assert.equal(getDisplayNote("단판\r\n메모"), "단판");
});
