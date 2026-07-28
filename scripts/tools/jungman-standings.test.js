const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** 프로젝트 TS를 그대로 트랜스파일해 실제 로직을 돌린다 (jungman-contract.test.js와 같은 방식). */
function loadModule(relativePath) {
  const compiled = ts.transpileModule(readProjectFile(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, () => ({}));
  return mod.exports;
}

const { parseJungmanStandings, buildJungmanGroupTables } = loadModule("lib/jungman-standings.ts");

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

const match = (group, home, away, homeSets, awaySets) => ({ group, home, away, homeSets, awaySets });
const rowsOf = (data, groupName) =>
  buildJungmanGroupTables(data).find((table) => table.name === groupName).rows;

test("발표 전·깨진 입력은 전부 null (화면은 '발표 전'으로 떨어진다)", () => {
  for (const raw of [null, "", "   ", "{깨진 JSON", "[]", '"문자열"', "123"]) {
    assert.equal(parseJungmanStandings(raw), null, `raw=${raw}`);
  }
  // announced가 없거나 false면 데이터가 있어도 공개하지 않는다
  const groups = [{ name: "A", teams: ["가", "나", "다"] }];
  assert.equal(parseJungmanStandings(JSON.stringify({ groups })), null);
  assert.equal(parseJungmanStandings(JSON.stringify({ announced: false, groups })), null);
  // announced만 true고 조가 없으면 그릴 게 없다
  assert.equal(parseJungmanStandings(JSON.stringify({ announced: true, groups: [] })), null);
});

test("승 → 세트득실 → 세트승 → 팀명 순으로 정렬한다", () => {
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [
        match("A", "가", "나", 2, 0), // 가 1승, 나 1패
        match("A", "나", "다", 2, 1), // 나 1승1패, 다 1패
        match("A", "다", "가", 2, 1), // 다 1승1패, 가 1승1패
      ],
    })
  );

  // 셋 다 1승 1패 — 세트득실로 갈린다 (가 3-2=+1, 나 2-3=-1, 다 3-3=0)
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.setsWon, row.setDiff, row.remaining]),
    [
      ["가", 1, 1, 3, 1, 0],
      ["다", 1, 1, 3, 0, 0],
      ["나", 1, 1, 2, -1, 0],
    ]
  );
});

test("세트득실이 같으면 세트승, 그것도 같으면 팀명", () => {
  const tie = parseJungmanStandings(
    JSON.stringify({ announced: true, groups: [{ name: "A", teams: ["다", "나", "가"] }], matches: [] })
  );
  // 한 경기도 안 치렀으면 전부 동률 — 팀명 순, 잔여는 팀당 2경기
  assert.deepEqual(rowsOf(tie, "A").map((row) => [row.team, row.remaining]), [
    ["가", 2],
    ["나", 2],
    ["다", 2],
  ]);

  // 나·다 둘 다 1승1패 득실 0 — 세트를 더 딴 다(3)가 팀명 순(나)을 이기고 위로 간다
  const bySetsWon = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다", "라"] }],
      matches: [
        match("A", "나", "가", 2, 0),
        match("A", "라", "나", 2, 0),
        match("A", "다", "가", 2, 1),
        match("A", "라", "다", 2, 1),
      ],
    })
  );
  const rows = rowsOf(bySetsWon, "A");
  assert.deepEqual(
    rows.map((row) => [row.team, row.wins, row.setsWon, row.setDiff]),
    [
      ["라", 2, 4, 3],
      ["다", 1, 3, 0],
      ["나", 1, 2, 0],
      ["가", 0, 1, -3],
    ]
  );
  // 4팀 조면 팀당 예정 3경기 — 잔여는 풀리그(조 인원 - 1) 기준으로 따라 움직인다
  assert.deepEqual(rows.map((row) => row.remaining), [1, 1, 1, 1]);
});

test("아직 안 치른 경기·오타는 집계에서 빠지고 잔여로 남는다", () => {
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [
        match("A", "가", "나", 0, 0), // 예정
        match("A", "가", "다", 1, 1), // 무승부는 없는 종목 — 미완료로 본다
        match("A", "가", "없는팀", 2, 0), // 오타
        match("B", "가", "나", 2, 0), // 다른 조
        match("A", "가", "가", 2, 0), // 자기 자신
        { group: "A", home: "나", away: "다", homeSets: -1, awaySets: 2 }, // 음수
        { group: "A", home: "나", away: "다", homeSets: "2", awaySets: "0" }, // 문자열 숫자는 통과
      ],
    })
  );

  // 파서는 구조만 본다(예정·무승부·자기자신·음수를 버려 3건 남음).
  // 조 소속·오타 판정은 명부를 아는 표 계산에서 한다 — 아래 행이 그 결과다.
  assert.equal(data.matches.length, 3);
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.remaining]),
    [
      ["나", 1, 0, 1],
      ["가", 0, 0, 2],
      ["다", 0, 1, 1],
    ]
  );
});

test("공개 페이지와 관리자 저장이 같은 키를 쓴다", () => {
  const { JUNGMAN_STANDINGS_KEY } = loadModule("lib/jungman-standings.ts");
  assert.equal(JUNGMAN_STANDINGS_KEY, "jungman_standings");

  const page = readProjectFile("app/jungman/standings/page.tsx");
  assert.match(page, /export const revalidate = \d+/);
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /getSetting\(JUNGMAN_STANDINGS_KEY\)/);

  // 저장 경로: 관리자 세션 뒤 + 저장 후 공개 페이지 캐시 무효화
  const route = readProjectFile("app/api/admin/jungman/route.ts");
  assert.ok(route.includes('"save-standings"'));
  assert.match(route, /writeSetting\(JUNGMAN_STANDINGS_KEY, raw\)/);
  assert.match(route, /revalidatePath\("\/jungman\/standings"\)/);

  // 탭은 한 배열에서만 — 페이지마다 따로 적으면 갈라진다
  const nav = readProjectFile("components/jungman/JungmanSubNav.tsx");
  assert.match(nav, /href: "\/jungman", label: "투표"/);
  assert.match(nav, /href: "\/jungman\/standings", label: "순위"/);
  for (const file of ["app/jungman/page.tsx", "app/jungman/standings/page.tsx"]) {
    assert.match(readProjectFile(file), /<JungmanSubNav activeHref=/, file);
  }
});

process.exitCode = failed ? 1 : 0;
