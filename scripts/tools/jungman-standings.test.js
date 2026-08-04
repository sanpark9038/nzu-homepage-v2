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

  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /export const revalidate = \d+/);
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /getSetting\(JUNGMAN_STANDINGS_KEY\)/);

  // 저장 경로: 관리자 세션 뒤 + 저장 후 공개 페이지 캐시 무효화
  const route = readProjectFile("app/api/admin/jungman/route.ts");
  assert.ok(route.includes('"save-standings"'));
  assert.match(route, /writeSetting\(JUNGMAN_STANDINGS_KEY, raw\)/);
  assert.match(route, /revalidatePath\("\/jungman"\)/);

  // 순위표와 투표 결과가 한 페이지에 있어야 한다 — 탭으로 되돌아가면 이게 깨진다
  const merged = readProjectFile("app/jungman/page.tsx");
  assert.match(merged, /<JungmanGroupTables/);
  assert.match(merged, /<details/);
  // 옛 주소는 리다이렉트로만 살아 있다
  assert.match(readProjectFile("app/jungman/standings/page.tsx"), /redirect\("\/jungman"\)/);
});

// ── 세트별 입력 ───────────────────────────────────────────────────────────
const set = (map, home, away, winner) => ({ map, home, away, winner: winner ?? null });
const withSets = (sets, homeSets, awaySets) =>
  parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [{ group: "A", home: "가", away: "나", homeSets, awaySets, sets }],
    })
  );

test("세트 승자 수가 점수가 된다 (저장된 점수는 무시)", () => {
  const sets = [
    set("라데온", "주하랑", "냥냥코기", "home"),
    set("녹아웃", "먼진", "밤하밍", "home"),
    set("애티튜드", "가1", "나1", "away"),
    set("오디세이", "가2", "나2", "home"),
    set("백룸", "가3", "나3", "away"),
    set("아이올로스", "가4", "나4", "home"),
    set("옥타곤", "가5", "나5", "away"),
    set("녹아웃", "가6", "나6", "away"),
    set("라데온", "가7", "나7", "home"),
  ];
  // 저장된 점수는 0:0(엉뚱한 값)이지만 세트가 이긴다
  const data = withSets(sets, 0, 0);
  assert.equal(data.matches.length, 1);
  assert.equal(data.matches[0].homeSets, 5);
  assert.equal(data.matches[0].awaySets, 4);
  // 다음 단계(공개 화면)가 읽을 수 있게 세트도 실려 나간다
  assert.equal(data.matches[0].sets.length, 9);
  assert.deepEqual(data.matches[0].sets[0], {
    map: "라데온",
    home: "주하랑",
    away: "냥냥코기",
    winner: "home",
  });
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.setsWon, row.remaining]),
    [
      ["가", 1, 0, 5, 1],
      ["다", 0, 0, 0, 2], // 세트득실 0이 나(-1)보다 위
      ["나", 0, 1, 4, 1],
    ]
  );
});

test("승자 없는 세트는 어느 쪽에도 안 센다", () => {
  const data = withSets(
    [set("녹아웃", "가1", "나1", "home"), set("라데온", "가2", "나2", "home"), set("백룸", "가3", "나3", "away"), set("옥타곤", "가4", "나4")],
    9,
    9
  );
  assert.equal(data.matches[0].homeSets, 2);
  assert.equal(data.matches[0].awaySets, 1);
});

test("세트 승자가 동점이면 진행 중 — 집계에서 빠지고 잔여로 남는다", () => {
  const data = withSets(
    [
      set("녹아웃", "가1", "나1", "home"),
      set("라데온", "가2", "나2", "away"),
      set("백룸", "가3", "나3", "home"),
      set("옥타곤", "가4", "나4", "away"),
    ],
    5,
    0 // 저장된 점수로는 가의 승리처럼 보이지만 세트가 2:2라 미완료다
  );
  assert.equal(data.matches.length, 0);
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.remaining]),
    [
      ["가", 0, 0, 2],
      ["나", 0, 0, 2],
      ["다", 0, 0, 2],
    ]
  );
});

test("세트가 없는 경기는 저장된 점수를 그대로 쓴다 (기존 데이터 보존)", () => {
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [match("A", "가", "나", 5, 4), { group: "A", home: "나", away: "다", homeSets: 3, awaySets: 2, sets: [] }],
    })
  );
  // sets가 빈 배열이면 없는 것과 같다 — 저장된 점수로 떨어진다
  assert.deepEqual(
    data.matches.map((m) => [m.home, m.away, m.homeSets, m.awaySets, m.sets]),
    [
      ["가", "나", 5, 4, undefined],
      ["나", "다", 3, 2, undefined],
    ]
  );
});

test("깨진 세트만 버리고 나머지는 산다", () => {
  // sets가 배열이 아니면 통째로 무시하고 저장된 점수로 떨어진다
  const notArray = withSets({ map: "녹아웃" }, 2, 1);
  assert.equal(notArray.matches[0].homeSets, 2);
  assert.equal(notArray.matches[0].sets, undefined);

  const data = withSets(
    [
      set("녹아웃", "가1", "나1", "home"),
      null, // 객체가 아님 → 맵·선수·승자가 다 없어 버려진다
      set("", "", "", "home"), // 이름 없이 승자만 — 치른 세트로 산다
      set("백룸", "가3", "나3", "left"), // 엉뚱한 winner → 진행 중으로 떨어진다
      { map: 7, home: ["가4"], away: null, winner: "away" }, // 이름은 다 버려지고 승자만 남는다
      set("", "", "", null), // 전부 빈 줄 → 버려진다
      set("옥타곤", "가5", "나5", "away"),
      set("라데온", "가6", "나6", "home"),
    ],
    0,
    0
  );
  assert.deepEqual(data.matches[0].sets, [
    { map: "녹아웃", home: "가1", away: "나1", winner: "home" },
    { map: "", home: "", away: "", winner: "home" },
    { map: "백룸", home: "가3", away: "나3", winner: null },
    { map: "", home: "", away: "", winner: "away" },
    { map: "옥타곤", home: "가5", away: "나5", winner: "away" },
    { map: "라데온", home: "가6", away: "나6", winner: "home" },
  ]);
  assert.equal(data.matches[0].homeSets, 3);
  assert.equal(data.matches[0].awaySets, 2);
});

test("이름 없이 승자만 찍은 세트도 점수에 들어간다", () => {
  // 관리자 화면에서 급할 때 쓰는 길 — 이름 적은 세트와 섞여도 승수가 빠지면 안 된다
  const data = withSets(
    [
      set("라데온", "가1", "나1", "home"),
      set("녹아웃", "가2", "나2", "home"),
      set("", "", "", "home"),
      set("", "", "", "home"),
      set("", "", "", "home"),
      set("", "", "", "away"),
    ],
    0,
    0
  );
  assert.equal(data.matches[0].homeSets, 5);
  assert.equal(data.matches[0].awaySets, 1);
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses]),
    [
      ["가", 1, 0],
      ["다", 0, 0],
      ["나", 0, 1],
    ]
  );
});

test("setScoreOf를 관리자 화면과 파서가 같이 쓴다", () => {
  const { setScoreOf } = loadModule("lib/jungman-standings.ts");
  assert.deepEqual(setScoreOf([]), { home: 0, away: 0 });
  assert.deepEqual(setScoreOf([set("m", "a", "b", "home"), set("m", "a", "b")]), { home: 1, away: 0 });
  // 관리자 화면이 같은 함수를 불러야 계산이 둘로 갈라지지 않는다
  const admin = readProjectFile("app/admin/jungman/JungmanStandingsAdmin.tsx");
  assert.match(admin, /import \{ setScoreOf.*\} from "@\/lib\/jungman-standings"/);
  // JSON 왕복에서 세트가 증발하면 안 된다
  assert.match(admin, /sets: parseSets\(m\?\.sets\)/);
});

// ── 경기 날짜 ────────────────────────────────────────────────────────────
const withDate = (date) =>
  parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [{ group: "A", home: "가", away: "나", homeSets: 5, awaySets: 3, date }],
    })
  );

test("YYYY-MM-DD 날짜는 그대로 실려 나간다", () => {
  const data = withDate("2026-08-06");
  assert.equal(data.matches[0].date, "2026-08-06");
  // 세트와 함께 있어도 둘 다 산다 — 카드뉴스 덱이 둘 다 읽는다
  const withBoth = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [
        {
          group: "A",
          home: "가",
          away: "나",
          homeSets: 0,
          awaySets: 0,
          date: "2026-08-06",
          sets: [set("라데온", "주하랑", "냥냥코기", "home")],
        },
      ],
    })
  );
  assert.equal(withBoth.matches[0].date, "2026-08-06");
  assert.equal(withBoth.matches[0].sets.length, 1);
  assert.equal(withBoth.matches[0].homeSets, 1);
});

test("형식이 어긋난 날짜는 버리고 경기는 살린다", () => {
  for (const bad of ["2026/08/06", "내일", "2026-8-6", "2026-08-06T09:00:00Z", 20260806, null, undefined, {}]) {
    const data = withDate(bad);
    assert.equal(data.matches.length, 1, `date=${JSON.stringify(bad)}`);
    assert.equal(data.matches[0].date, undefined, `date=${JSON.stringify(bad)}`);
    assert.equal(data.matches[0].homeSets, 5);
  }
});

test("날짜는 순위 계산에 아무 영향을 주지 않는다", () => {
  const body = (date) => ({
    announced: true,
    groups: [{ name: "A", teams: ["가", "나", "다"] }],
    matches: [
      { group: "A", home: "가", away: "나", homeSets: 5, awaySets: 3, ...(date ? { date } : {}) },
      { group: "A", home: "나", away: "다", homeSets: 5, awaySets: 0, ...(date ? { date } : {}) },
    ],
  });
  const shape = (data) =>
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.setsWon, row.setDiff, row.remaining]);
  assert.deepEqual(
    shape(parseJungmanStandings(JSON.stringify(body("2026-08-06")))),
    shape(parseJungmanStandings(JSON.stringify(body(null))))
  );
});

process.exitCode = failed ? 1 : 0;
