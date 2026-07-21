// 극락/나락 집계 회귀 테스트 — 최다승/최다패 명단, 동률 모두 포함, 결과 없는 경기 제외.
//   npm run test:overlay-heaven-hell
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(repoRoot, "lib", "overlay-types.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { heavenHell } = mod.exports;

const row = (leftPlayer, rightPlayer, result) => ({ leftPlayer, rightPlayer, result });
const set = (...entries) => ({ entries });
const names = (list) => list.map((x) => x.name).sort();

test("최다승=극락 · 최다패=나락, 결과 없는 행은 무시", () => {
  const r = heavenHell([
    set(row("A", "B", "left"), row("A", "C", "left"), row("A", "D", null)),
  ]);
  // A: 2승 / B·C: 각 1패
  assert.deepEqual(names(r.heaven), ["A"]);
  assert.equal(r.winMax, 2);
  assert.deepEqual(names(r.hell), ["B", "C"]);
  assert.equal(r.lossMax, 1);
});

test("선수마다 소속 팀(좌/우) 표시", () => {
  const r = heavenHell([set(row("A", "B", "left"), row("C", "D", "right"))]);
  // A(좌) 승 · D(우) 승 → 극락. B(우) 패 · C(좌) 패 → 나락.
  assert.deepEqual(r.heaven.find((x) => x.name === "A").side, "left");
  assert.deepEqual(r.heaven.find((x) => x.name === "D").side, "right");
  assert.deepEqual(r.hell.find((x) => x.name === "B").side, "right");
  assert.deepEqual(r.hell.find((x) => x.name === "C").side, "left");
});

test("동률이면 모두 포함, 세트 넘어 합산", () => {
  const r = heavenHell([
    set(row("A", "B", "left"), row("C", "D", "left")),   // A승 B패 / C승 D패
    set(row("A", "C", "right"), row("B", "D", "left")),  // C승 A패 / B승 D패
  ]);
  // 승: A1 C2 B1 → 극락 C(2). 패: B1 D2 A1 → 나락 D(2)
  assert.deepEqual(names(r.heaven), ["C"]);
  assert.deepEqual(names(r.hell), ["D"]);

  const tie = heavenHell([set(row("A", "B", "left"), row("C", "D", "right"))]);
  // A1승 D1승 동률 → 극락 둘 다. B1패 C1패 동률 → 나락 둘 다.
  assert.deepEqual(names(tie.heaven), ["A", "D"]);
  assert.deepEqual(names(tie.hell), ["B", "C"]);
});

test("결과 없으면 빈 명단", () => {
  const r = heavenHell([set(row("A", "B", null))]);
  assert.deepEqual(r.heaven, []);
  assert.deepEqual(r.hell, []);
  assert.equal(r.winMax, 0);
});
