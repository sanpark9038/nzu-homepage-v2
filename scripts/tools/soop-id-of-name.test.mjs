// soopIdOfName 매칭 회귀 테스트 — 이름/닉네임/"성 뗀 이름" 매칭, 미인식은 null.
//   npm run test:soop-id-of-name
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(repoRoot, "lib", "soop.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { soopIdOfName, buildSoopPlayUrl } = mod.exports;

const db = [
  { name: "조일장", nickname: "일장이", soopId: "iljang" },
  { name: "기나", nickname: null, soopId: "gina7" },
  { name: "노숲", nickname: "노숲", soopId: null }, // soop_id 없음 → 링크 불가
];

test("이름·닉네임·성 뗀 이름으로 매칭", () => {
  assert.equal(soopIdOfName(db, "조일장"), "iljang");   // 풀네임
  assert.equal(soopIdOfName(db, "일장"), "iljang");     // 성 뗀 이름
  assert.equal(soopIdOfName(db, "일장이"), "iljang");   // 닉네임
  assert.equal(soopIdOfName(db, "기나"), "gina7");
});

test("미등록·빈값·soop_id 없음은 null", () => {
  assert.equal(soopIdOfName(db, "없는선수"), null);
  assert.equal(soopIdOfName(db, ""), null);
  assert.equal(soopIdOfName(db, "노숲"), null); // 등록됐지만 soop_id 없음
});

test("buildSoopPlayUrl은 라이브 시청 페이지", () => {
  assert.equal(buildSoopPlayUrl("gina7"), "https://play.sooplive.com/gina7/");
  assert.equal(buildSoopPlayUrl(null), null);
});
