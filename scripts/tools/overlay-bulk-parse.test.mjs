// 오버레이 일괄입력 파서 회귀 테스트.
// 새 붙여넣기 양식 규칙을 추가할 때마다 기존 양식이 안 깨졌는지 이걸로 확인한다.
//   npm run test:overlay-bulk-parse
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// 파서는 런타임 import가 없는(타입만 쓰는) 순수 모듈이라 그대로 트랜스파일해 쓰면 된다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(repoRoot, "lib", "overlay-bulk-parse.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { parseBulk } = mod.exports;

const pairs = (r) => r.rows.map((x) => `${x.leftPlayer}/${x.rightPlayer}`);
const full = (r) =>
  r.rows.map((x) => `${x.leftPlayer}[${x.leftRace ?? "-"}] vs ${x.rightPlayer}[${x.rightRace ?? "-"}] @${x.map || "-"} =${x.result ?? "-"}`);

// ── 이모지 양식 (🆚 구분자, 전부 명시) ────────────────────────────
test("이모지 양식: 티어+종족, ✅ 승자, [맵], 공백 이름, 맵만 있는 행", () => {
  const r = parseBulk(
    `1️⃣구보라3P⬜️🆚️✅️라 미3Z [녹]
2️⃣권아온8Z⬜️🆚️⬜️미진이8P [라] <<
3️⃣김채이6P⬜️🆚️⬜️려 원6T [녹]
4️⃣카히리2Z⬜️🆚️⬜️하블리2Z [폴]
5️⃣[녹]`,
    "", [], undefined, true,
  );
  assert.equal(r.vsFormat, true);
  assert.deepEqual(full(r), [
    "구보라[P] vs 라 미[Z] @녹 =right",
    "권아온[Z] vs 미진이[P] @라 =-",
    "김채이[P] vs 려 원[T] @녹 =-",
    "카히리[Z] vs 하블리[Z] @폴 =-",
    "[-] vs [-] @녹 =-",
  ]);
  assert.deepEqual(r.unrecognized, []);
});

test("이모지 양식: 티어 없는 이름, 🅰️ 에이스 줄은 선수 미정+맵", () => {
  const r = parseBulk(
    `1️⃣블리Z⬜️🆚️⬜️카히리Z [폴]
2️⃣려원T⬜️🆚️⬜️김채이P [녹]
🅰️⬜️🆚️⬜️ [라]`,
    "", [], undefined, true,
  );
  assert.deepEqual(full(r), [
    "블리[Z] vs 카히리[Z] @폴 =-",
    "려원[T] vs 김채이[P] @녹 =-",
    "[-] vs [-] @라 =-",
  ]);
});

test("이모지 양식: 왼쪽 ✅ = left, 영문 닉네임은 종족 안 뗌", () => {
  assert.deepEqual(parseBulk("1️⃣✅️구보라3P⬜️🆚️⬜️라 미3Z [녹]", "", [], undefined, true).rows.map((x) => x.result), ["left"]);
  assert.deepEqual(full(parseBulk("SharpZ⬜️🆚️⬜️Best [녹]", "", [], undefined, true)), ["SharpZ[-] vs Best[-] @녹 =-"]);
});

// ── vs 양식 (붙여쓰기 허용) ──────────────────────────────────────
test("vs 양식: 붙여쓴 vs·대문자·마침표 모두 인식, 승패는 안 넣음", () => {
  const r = parseBulk(
    `조기석 vs 김정우
쿨지지 vs김건욱
전흥식 vs액구
이창우vs지동원
김영진 VS 진영화
김수식vs.신상문`,
    "", [], undefined, true,
  );
  assert.deepEqual(pairs(r), ["조기석/김정우", "쿨지지/김건욱", "전흥식/액구", "이창우/지동원", "김영진/진영화", "김수식/신상문"]);
  assert.ok(r.rows.every((x) => !x.result));
});

test("vs 양식: 티어 접두어 제거, 종족 유지, 닉네임 내부 vs 보호", () => {
  assert.deepEqual(pairs(parseBulk("4티어 성예량 vs 뚜미\n4 티어 너부리 vs 라운이", "", [], undefined, true)), ["성예량/뚜미", "너부리/라운이"]);
  assert.deepEqual(full(parseBulk("영희P vs철수T", "", [], undefined, true)), ["영희[P] vs 철수[T] @- =-"]);
  assert.deepEqual(pairs(parseBulk("AvsB vs 김정우", "", [], undefined, true)), ["AvsB/김정우"]);
});

test("vs 양식: vs 없는 줄은 unrecognized로 보고", () => {
  const r = parseBulk("조기석 vs 김정우\n김기덕 이경민\n이창우 vs 지동원", "", [], undefined, true);
  assert.deepEqual(pairs(r), ["조기석/김정우", "이창우/지동원"]);
  assert.deepEqual(r.unrecognized, ["김기덕 이경민"]);
});

// ── vs 양식 + 맵 (종족 표기가 없는 스트리머 채팅) ────────────────────
const MAPS = ["녹아웃", "라데온", "애티튜드", "오디세이", "백룸", "컬러리스 페이트", "아이올로스", "옥타곤"];

test("vs 양식: 번호 붙은 채팅 통째 붙여넣기 → 선수/선수/맵, vs 없는 줄은 탈락", () => {
  const r = parseBulk(
    `1.비재희VS슈슈 에티
2.삐약이VS라운 오디
3.구키VS황단비 라데
6.핀 녹
--------
9.에결`,
    "", [], undefined, true, MAPS,
  );
  assert.deepEqual(full(r), [
    "비재희[-] vs 슈슈[-] @에티 =-",
    "삐약이[-] vs 라운[-] @오디세이 =-",
    "구키[-] vs 황단비[-] @라데온 =-",
  ]);
  assert.deepEqual(r.unrecognized, ["6.핀 녹", "--------", "9.에결"]);
});

test("vs 양식: 맵목록에 없는 맵도 적힌 그대로 쓴다 / 오른쪽 1토큰이면 맵 없음", () => {
  assert.deepEqual(full(parseBulk("영희 vs 철수 미지의맵", "", [], undefined, true, MAPS)), ["영희[-] vs 철수[-] @미지의맵 =-"]);
  assert.deepEqual(full(parseBulk("영희 vs 철수", "", [], undefined, true, MAPS)), ["영희[-] vs 철수[-] @- =-"]);
});

test("vs 양식: 선수 앞 맵은 맵목록에 2글자 이상으로 맞을 때만 (두 어절 이름 보호)", () => {
  assert.deepEqual(full(parseBulk("라데 영희 vs 철수", "", [], undefined, true, MAPS)), ["영희[-] vs 철수[-] @라데온 =-"]);
  // "라"는 라데온의 앞글자지만 한 글자라 맵으로 안 뺏는다
  assert.deepEqual(full(parseBulk("라 미 vs 철수", "", [], undefined, true, MAPS)), ["라 미[-] vs 철수[-] @- =-"]);
  // 오른쪽은 한 글자여도 마지막 토큰이면 맵 — 정식 이름으로 교정
  assert.deepEqual(full(parseBulk("영희 vs 슈슈 녹", "", [], undefined, true, MAPS)), ["영희[-] vs 슈슈[-] @녹아웃 =-"]);
});

// ── 프로리그 명단(채팅) 양식 — 이모지/vs 분기가 삼키면 안 됨 ────────
test("프로리그 명단: 채팅 붙여넣기 → 좌팀/우팀/맵 열로 분해", () => {
  const r = parseBulk(
    `[2. lllllll] JSA_Sharp1: 일장 재호 기석 현재 정우
[2. lllllll] RoyaL1111: 지성 성대 짭제 영재 윤철
[2. lllllll] RoyaL1111: 매치 실피 옥타 녹아 애티`,
    "재호", ["일장", "재호", "기석"], undefined, false,
  );
  assert.equal(r.rows.length, 5);
  assert.equal(`${r.rows[0].leftPlayer}/${r.rows[0].rightPlayer}/${r.rows[0].map}`, "일장/지성/매치");
});

test("빈 입력은 null", () => {
  assert.equal(parseBulk("", "", [], undefined, true), null);
});
