// 티어 동결 KV 파싱/비교 회귀 테스트.
//   npm run test:tier-freeze
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// lib/tier-freeze.ts 는 런타임 import가 없는 순수 모듈이라 그대로 트랜스파일해 쓰면 된다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(repoRoot, "lib", "tier-freeze.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { parseTierFreeze, buildTierFreezeValue, frozenTierOf } = mod.exports;

test("깨진 값·비활성 값은 null", () => {
  assert.equal(parseTierFreeze(null), null);
  assert.equal(parseTierFreeze(""), null);
  assert.equal(parseTierFreeze("{not json"), null);
  assert.equal(parseTierFreeze(JSON.stringify({ active: false, frozenAt: "", snapshot: {} })), null);
  assert.equal(parseTierFreeze(JSON.stringify({ active: true, frozenAt: "", snapshot: null })), null);
});

test("build → parse 왕복", () => {
  const value = buildTierFreezeValue(
    [
      { id: "a", tier: "S" },
      { id: "b", tier: "A" },
      { id: "c", tier: "" }, // 티어 없음 → 제외
      { id: "", tier: "S" }, // id 없음 → 제외
    ],
    "2026-08-05T05:00:00.000Z"
  );

  const freeze = parseTierFreeze(value);
  assert.equal(freeze.active, true);
  assert.equal(freeze.frozenAt, "2026-08-05T05:00:00.000Z");
  assert.deepEqual(freeze.snapshot, { a: "S", b: "A" });
});

test("동결 티어가 라이브와 다를 때만 정보가 나온다", () => {
  const freeze = parseTierFreeze(
    buildTierFreezeValue(
      [
        { id: "a", tier: "S" },
        { id: "b", tier: "S" },
        { id: "c", tier: "A" },
      ],
      "2026-08-05T05:00:00.000Z"
    )
  );

  assert.equal(frozenTierOf(freeze, "a", "S"), null); // 변동 없음
  assert.equal(frozenTierOf(freeze, "a", " S "), null); // 공백만 다름
  assert.equal(frozenTierOf(freeze, "zzz", "S"), null); // 스냅샷에 없음
  assert.equal(frozenTierOf(null, "a", "A"), null); // 미동결

  // 승급자만 동결 시점 티어를 돌려준다
  assert.equal(frozenTierOf(freeze, "a", "SS"), "S");
  assert.equal(frozenTierOf(freeze, "c", "S"), "A");
});
