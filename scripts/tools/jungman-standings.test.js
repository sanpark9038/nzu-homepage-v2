const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** 프로젝트 TS를 그대로 트랜스파일해 실제 로직을 돌린다 (jungman-contract.test.js와 같은 방식). */
function loadModule(relativePath, resolve = () => ({})) {
  const compiled = ts.transpileModule(readProjectFile(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, resolve);
  return mod.exports;
}

const {
  parseJungmanStandings,
  buildJungmanGroupTables,
  sortJungmanMatches,
  upcomingJungmanMatches,
  buildJungmanPlayerRanks,
  buildJungmanScenarios,
} = loadModule("lib/jungman-standings.ts");

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

test("세 기준까지 동률이면 맞대결 승자가 위로 온다 (공식 4번째 기준)", () => {
  // 가·나가 1승1패·세트득실 0... 이 아니라 완전 동률이 되도록 짠 데이터.
  // 나가 가를 5:0으로 이겼으니 팀명 순(가)을 뒤집고 나가 위여야 한다.
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다", "라"] }],
      matches: [
        match("A", "나", "가", 5, 3), // 맞대결 — 나 승
        match("A", "가", "다", 5, 3),
        match("A", "라", "나", 5, 3),
      ],
    })
  );
  const before = JSON.stringify(data);
  const rows = rowsOf(data, "A");
  assert.deepEqual(
    rows.map((row) => [row.team, row.wins, row.losses, row.setsWon, row.setDiff]),
    [
      ["라", 1, 0, 5, 2],
      ["나", 1, 1, 8, 0], // 가와 승·세트득실·세트승이 똑같다 — 맞대결로 갈린다
      ["가", 1, 1, 8, 0],
      ["다", 0, 1, 3, -2],
    ]
  );
  // 계산은 순수해야 한다 — 원본 경기 데이터를 건드리면 두 번째 호출이 달라진다
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(rowsOf(data, "A").map((row) => row.team), ["라", "나", "가", "다"]);
});

test("세 팀이 서로 물고 물리면 못 가른다 — 팀명 순 그대로", () => {
  // 가>나>다>가. 셋 다 1승1패·세트득실 0·세트승 5라 승자승 승수도 각 1승으로 같다.
  // 누가 위인지 정할 근거가 없으니 화면이 흔들리지 않게 팀명 순을 유지한다.
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["다", "나", "가"] }],
      matches: [match("A", "가", "나", 5, 0), match("A", "나", "다", 5, 0), match("A", "다", "가", 5, 0)],
    })
  );
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.setsWon, row.setDiff]),
    [
      ["가", 1, 5, 0],
      ["나", 1, 5, 0],
      ["다", 1, 5, 0],
    ]
  );
});

test("맞대결 기록이 없는 동률도 못 가른다", () => {
  // 오타로 경기가 빠지면 승자승 승수가 둘 다 0 — 근거가 없으니 팀명 순
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [match("A", "가", "다", 5, 3), match("A", "나", "다", 5, 3)],
    })
  );
  assert.deepEqual(rowsOf(data, "A").map((row) => row.team), ["가", "나", "다"]);
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

  // 파서는 구조만 본다 — 자기자신·음수만 버리고 5건이 남는다.
  // 안 끝난 경기(예정·무승부)도 실려 나가되 decided:false를 달고 집계에서 빠진다.
  assert.equal(data.matches.length, 5);
  assert.deepEqual(
    data.matches.map((m) => [m.home, m.away, m.decided]),
    [
      ["가", "나", false], // 0:0 예정
      ["가", "다", false], // 무승부는 없는 종목 — 미완료
      ["가", "없는팀", true],
      ["가", "나", true], // B조
      ["나", "다", true],
    ]
  );
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
  assert.equal(data.matches.length, 1);
  assert.equal(data.matches[0].decided, false);
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

// ── 공개 화면 정렬·팀 조회 ───────────────────────────────────────────────
// decided는 파서가 다는 표식이다 — 손으로 만든 경기에도 실어야 결과 목록에 잡힌다
const dated = (home, date, decided = true) => ({
  group: "A",
  home,
  away: "나",
  homeSets: 5,
  awaySets: decided ? 3 : 5,
  decided,
  ...(date ? { date } : {}),
});

test("경기 결과는 최신 날짜가 위로 온다", () => {
  const sorted = sortJungmanMatches([dated("가", "2026-08-06"), dated("다", "2026-08-13"), dated("라", "2026-08-07")]);
  assert.deepEqual(sorted.map((m) => m.date), ["2026-08-13", "2026-08-07", "2026-08-06"]);
});

test("날짜 없는 경기는 맨 뒤로 가고 서로의 순서는 유지된다", () => {
  const sorted = sortJungmanMatches([
    dated("가"),
    dated("나2", "2026-08-06"),
    dated("다"),
    dated("라", "2026-08-07"),
    dated("마", "2026-08-06"),
  ]);
  assert.deepEqual(sorted.map((m) => m.home), ["라", "나2", "마", "가", "다"]);
});

test("정렬은 원본 배열을 건드리지 않는다", () => {
  // 같은 배열을 순위 계산이 보고 있다 — 제자리 정렬이면 조용히 순서가 바뀐다
  const original = [dated("가", "2026-08-06"), dated("다", "2026-08-13")];
  const sorted = sortJungmanMatches(original);
  assert.deepEqual(original.map((m) => m.home), ["가", "다"]);
  assert.notEqual(sorted, original);
  assert.deepEqual(sortJungmanMatches([]), []);
});

// ── 예정 경기 (일정) ─────────────────────────────────────────────────────
test("예정 경기(0:0 + 날짜)가 파서를 통과하고 decided:false를 단다", () => {
  const data = parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A", teams: ["가", "나", "다"] }],
      matches: [
        { group: "A", home: "가", away: "나", homeSets: 0, awaySets: 0, date: "2026-08-08" },
        { group: "A", home: "나", away: "다", homeSets: 5, awaySets: 2, date: "2026-08-01" },
      ],
    })
  );
  assert.deepEqual(
    data.matches.map((m) => [m.home, m.date, m.decided]),
    [
      ["가", "2026-08-08", false],
      ["나", "2026-08-01", true],
    ]
  );
});

test("예정 경기는 순위표에 안 들어간다 (승·패·잔여 그대로)", () => {
  const body = (schedule) => ({
    announced: true,
    groups: [{ name: "A", teams: ["가", "나", "다"] }],
    matches: [
      { group: "A", home: "나", away: "다", homeSets: 5, awaySets: 2 },
      ...(schedule ? [{ group: "A", home: "가", away: "나", homeSets: 0, awaySets: 0, date: "2026-08-08" }] : []),
    ],
  });
  const shape = (data) =>
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.losses, row.setsWon, row.setDiff, row.remaining]);

  const withSchedule = parseJungmanStandings(JSON.stringify(body(true)));
  assert.equal(withSchedule.matches.length, 2); // 일정은 데이터에 남아 있다
  assert.deepEqual(shape(withSchedule), shape(parseJungmanStandings(JSON.stringify(body(false)))));
  // 잔여가 예정 경기 때문에 깎이면 안 된다 — 나·다는 한 경기만 치렀다
  assert.deepEqual(shape(withSchedule), [
    ["나", 1, 0, 5, 3, 1],
    ["가", 0, 0, 0, 0, 2],
    ["다", 0, 1, 2, -3, 1],
  ]);
});

test("예정 경기는 가까운 날짜가 먼저 온다", () => {
  const upcoming = upcomingJungmanMatches([
    dated("가", "2026-08-13", false),
    dated("다", "2026-08-08", false),
    dated("라", "2026-08-09", false),
  ]);
  assert.deepEqual(upcoming.map((m) => m.date), ["2026-08-08", "2026-08-09", "2026-08-13"]);
});

test("날짜 없는 예정 경기와 끝난 경기는 일정에서 빠진다", () => {
  const upcoming = upcomingJungmanMatches([
    dated("가", "2026-08-13", false),
    dated("나2", null, false), // 언제인지 모른다
    dated("다", "2026-08-07"), // 이미 끝났다
    dated("라", null), // 끝났고 날짜도 없다
  ]);
  assert.deepEqual(upcoming.map((m) => m.home), ["가"]);
  assert.deepEqual(upcomingJungmanMatches([]), []);
});

test("경기 결과 목록에는 끝난 경기만 나온다", () => {
  const sorted = sortJungmanMatches([
    dated("가", "2026-08-13", false), // 예정 — 결과를 오염시키면 안 된다
    dated("다", "2026-08-08"),
    dated("라", null, false),
    dated("마", "2026-08-09"),
  ]);
  assert.deepEqual(sorted.map((m) => m.home), ["마", "다"]);
});

test("정렬·일정 추출이 원본 배열을 건드리지 않는다", () => {
  const original = [dated("가", "2026-08-13", false), dated("다", "2026-08-08"), dated("라", "2026-08-09", false)];
  const before = original.map((m) => m.home);
  sortJungmanMatches(original);
  upcomingJungmanMatches(original);
  assert.deepEqual(original.map((m) => m.home), before);
  assert.equal(original.length, 3);
});

test("팀 이름과 별칭 양쪽으로 팀을 찾는다", () => {
  const { jungmanTeamByName } = loadModule("lib/jungman.ts");
  for (const [name, code] of [
    ["캄몬스타즈", "KMS"],
    ["CALM", "KMS"],
    ["흑카데미", "HKA"],
    ["B.A", "HKA"],
    ["N.C.S", "NCS"],
  ]) {
    assert.equal(jungmanTeamByName(name)?.code, code, `name=${name}`);
  }
  assert.equal(jungmanTeamByName("없는팀"), undefined);
  assert.equal(jungmanTeamByName(""), undefined);

  // 순위표도 같은 함수로 로고를 찾는다 — 두 벌이 되면 한쪽만 고쳐진다
  assert.match(readProjectFile("app/jungman/JungmanGroupTables.tsx"), /jungmanTeamByName\(row\.team\)/);
});

test("공개 페이지가 경기 결과를 최신순으로 그린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /<JungmanMatchResults/);
  assert.match(page, /sortJungmanMatches\(standings\?\.matches \?\? \[\]\)/);
  // 세트 상세는 서버에서 그린다 — 공개 화면에 클라이언트 번들을 늘리지 않는다
  assert.doesNotMatch(readProjectFile("app/jungman/JungmanMatchResults.tsx"), /"use client"/);
});

test("공개 페이지가 예정 경기 일정을 그린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /upcomingJungmanMatches\(standings\?\.matches \?\? \[\]\)/);
  assert.match(page, /<JungmanSchedule/);
  // 순위표 → 일정(예정) → 경기 결과(치른 것) 순 — 시간이 위에서 아래로 흐른다
  assert.match(page, /<JungmanGroupTables[\s\S]*?<JungmanSchedule[\s\S]*?<JungmanMatchResults/);
  // 일정도 서버에서 그린다 — 공개 화면에 클라이언트 번들을 늘리지 않는다
  const schedule = readProjectFile("app/jungman/JungmanSchedule.tsx");
  assert.doesNotMatch(schedule, /"use client"/);
  // 시각은 lib 상수에서만 온다 — 두 벌로 적으면 조용히 어긋난다
  assert.match(schedule, /JUNGMAN_MATCH_TIME/);
});

// ── 달력 (넓은 화면) ─────────────────────────────────────────────────────
test("토너먼트 일정 7건 — 결승 날짜는 상수 한 벌에서만 온다", () => {
  const { JUNGMAN_TOURNAMENT, JUNGMAN_FINAL_DATE } = loadModule("lib/jungman.ts");
  assert.equal(JUNGMAN_TOURNAMENT.length, 7);
  assert.deepEqual(
    JUNGMAN_TOURNAMENT.map((round) => round.round),
    ["8강", "8강", "8강", "8강", "4강", "4강", "결승"]
  );
  assert.equal(JUNGMAN_TOURNAMENT[6].date, JUNGMAN_FINAL_DATE);
  // 형식이 어긋나면 달력이 조용히 그 칸을 잃는다
  for (const round of JUNGMAN_TOURNAMENT) {
    assert.match(round.date, /^\d{4}-\d{2}-\d{2}$/, `label=${round.label}`);
    assert.ok(round.label, `date=${round.date}`);
  }
  // 결승 날짜를 여기에 또 적으면 커버와 조용히 어긋난다 — 상수를 그대로 재사용해야 한다
  assert.match(readProjectFile("lib/jungman.ts"), /\{ date: JUNGMAN_FINAL_DATE, label: "결승"/);
});

test("ASL 일정 7건 — 전부 월·화·수다", () => {
  const { ASL_SCHEDULE } = loadModule("lib/jungman.ts");
  assert.equal(ASL_SCHEDULE.length, 7);
  // 요일은 눈으로 세지 말고 검산한다 — 한 칸만 밀려도 "월화수가 비는 이유"라는 설명이 거짓이 된다
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" });
  for (const item of ASL_SCHEDULE) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/, `label=${item.label}`);
    assert.ok(item.label, `date=${item.date}`);
    const day = weekday.format(new Date(`${item.date}T00:00:00+09:00`));
    assert.ok(["Mon", "Tue", "Wed"].includes(day), `${item.date}=${day}`);
  }
  // 8/10~12에는 ASL이 없다 — "월화수 전부"로 일반화하면 안 그러는 주가 지워진다
  const dates = ASL_SCHEDULE.map((item) => item.date);
  for (const date of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
    assert.ok(!dates.includes(date), date);
  }
});

test("달력이 ASL을 곁들이되 새 월 탭을 만들지 않는다", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  assert.match(source, /ASL_SCHEDULE/);
  // 월 탭은 우리 일정으로 먼저 정하고, ASL은 그 달 안에서만 섞인다
  assert.match(
    source,
    /ASL_SCHEDULE\.filter\(\(item\) => months\.includes\(item\.date\.slice\(0, 7\)\)\)/
  );
  // 우리 대회가 아니다 — 조 색(경기)도 금색(토너먼트)도 아닌 회색이고 카드 배경이 없다
  assert.match(source, /color: MUTED, time: JUNGMAN_MATCH_TIME, quiet: true/);
  assert.match(source, /event\.quiet \? "" : "bg-\[rgba\(155,185,240,0\.06\)\]"/);
});

test("달력 카드는 라벨과 시각을 한 줄에 쓴다", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  // 라벨 <p> 안에 시각이 들어 있어야 한 줄이다 — 시각용 <p>를 따로 두면 카드가 다시 세로로 늘어난다
  assert.match(source, /\{event\.label\}\s*\{!decided && event\.time \?[\s\S]{0,200}\{event\.time\}/);
  // 시각만 있는 <p>가 남아 있으면 줄이 갈라진 것이다
  assert.doesNotMatch(source, /<p[^>]*>\{event\.score \?\? event\.time\}<\/p>/);
  assert.doesNotMatch(source, /event\.score/);
});

test("끝난 경기는 시각 대신 팀별 세트 점수를 보여준다", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  // 점수는 팀별로 따로 온다 — "5 : 3" 한 덩어리로는 어느 줄이 어느 팀인지 못 붙인다
  assert.match(source, /homeSets\?: number;\s*awaySets\?: number;/);
  assert.match(source, /match\.decided \? \{ homeSets: match\.homeSets, awaySets: match\.awaySets \}/);
  // decided일 때만 시각을 지운다
  assert.match(
    source,
    /const decided = event\.homeSets !== undefined && event\.awaySets !== undefined/
  );
  // 각 팀 줄 오른쪽 끝에 그 팀의 세트 수 — 자리 흔들림을 막으려 tabular-nums
  assert.match(source, /<TeamRow\s+name=\{event\.home\}\s+sets=\{event\.homeSets\}/);
  assert.match(source, /<TeamRow\s+name=\{event\.away\}\s+sets=\{event\.awaySets\}/);
  assert.match(source, /ml-auto[^`"]*tabular-nums/);
});

test("끝난 경기는 이긴 팀이 밝고 진 팀이 흐리다", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  // 승패는 세트 수 비교로만 정한다 — 둘 다 밝으면 결과를 읽으려 숫자를 다시 세야 한다
  assert.match(source, /lost=\{decided && \(event\.homeSets as number\) < \(event\.awaySets as number\)\}/);
  assert.match(source, /lost=\{decided && \(event\.awaySets as number\) < \(event\.homeSets as number\)\}/);
  // 진 줄은 회색, 이긴 줄은 밝은 흰색 (팔레트 두 색)
  assert.match(source, /const tone = lost \? "text-\[#7a8299\]" : "text-\[#e8ebf2\]"/);
});

test("넓은 화면은 달력, 폰은 목록 — 갈리는 곳은 CSS뿐이다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /className="hidden md:block"[\s\S]{0,120}<JungmanCalendar/);
  assert.match(page, /className="md:hidden"[\s\S]{0,120}<JungmanSchedule/);
  // JS로 폭을 재면 서버·브라우저가 서로 다른 화면을 그린다
  assert.doesNotMatch(page, /matchMedia|innerWidth/);
  // 달력은 지난 경기도 그린다 — 예정만 넘기면 8월의 리듬이 반쪽이 된다
  assert.match(page, /<JungmanCalendar matches=\{standings\?\.matches \?\? \[\]\}/);
});

test("달력은 클라이언트지만 '오늘'은 마운트 뒤에 채운다", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  assert.match(source, /^"use client";/);

  // 오늘은 서버 렌더에 없다 — 서버 스냅샷이 null이고 브라우저에서만 진짜 값이 온다.
  // useState+useEffect로 흉내 내면 하이드레이션 불일치를 스스로 만든다(HomeHeroDeck과 같은 규칙).
  assert.match(source, /\(\) => SEOUL_YMD\.format\(new Date\(\)\),\s*\(\) => null/);
  assert.doesNotMatch(source, /useEffect\(/);
  // 시계를 읽는 곳은 그 스냅샷 딱 한 곳뿐이다
  assert.equal((source.match(/new Date\(\)|Date\.now\(\)/g) || []).length, 1);

  // 격자는 한국 날짜로만 만든다 — 브라우저 시간대가 어디든 같은 칸이 나와야 한다
  assert.match(source, /timeZone: "Asia\/Seoul"/);
  assert.doesNotMatch(source, /getUTC|getMonth\(\)|getDate\(\)|getDay\(\)/);
  // 시각·조 색·토너먼트 일정은 전부 lib 상수에서 온다
  assert.match(source, /JUNGMAN_MATCH_TIME/);
  assert.match(source, /JUNGMAN_GROUP_COLORS/);
  assert.match(source, /JUNGMAN_TOURNAMENT/);
});

test("커버가 대회 정보를 흡수하고 지도는 투표 결과 안으로 들어갔다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /<JungmanCover/);
  // 대회 정보가 커버 밖에 다시 생기면 같은 사실이 두 곳에 남는다
  assert.doesNotMatch(page, /대회 정보|총상금/);
  // 지도는 투표 순위 칩을 그린다 — <details>(인기투표 최종 결과) 안이 제 자리다
  assert.match(page, /<JungmanResults[\s\S]*?<JungmanMap markers=\{markers\} closed \/>[\s\S]*?<\/details>/);
  assert.match(page, /id="jm-map"[^>]*\[container-type:inline-size\]/);

  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  assert.doesNotMatch(cover, /"use client"/);
  // 마커 없는 지형 그림은 아무 의미가 없었다 — 그 자리는 다가오는 경기가 쓴다
  assert.doesNotMatch(cover, /JungmanMap/);
  assert.doesNotMatch(cover, /JUNGMAN_MAP_BASE|map-base/);
  // 지도가 없으니 억지 높이도 없다 — 내용이 높이를 정한다
  assert.doesNotMatch(cover, /min-h-\[/);
  // 순위표가 화면 밖으로 밀리면 이 페이지의 목적이 사라진다
  assert.doesNotMatch(cover, /100vh|100svh|h-screen|min-h-screen/);
  // 지도 선을 뭉개서 금지된 것
  assert.doesNotMatch(cover, /backdrop-blur|backdrop-filter/);
  // D-day 계산은 한 곳에만 — 페이지에서 커버로 옮겼다
  assert.match(cover, /daysToFinal/);
  assert.doesNotMatch(page, /daysToFinal|FINAL_DATE/);
});

test("커버가 다가오는 경기를 데이터로 받아 그린다", () => {
  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  const page = readProjectFile("app/jungman/page.tsx");
  // 커버는 예정 경기를 스스로 고르지 않는다 — 페이지가 upcomingJungmanMatches로 걸러 넘긴다
  assert.match(page, /<JungmanCover upcoming=\{upcoming\} \/>/);
  assert.match(cover, /upcoming = \[\] \}: \{ upcoming\?: JungmanStandingsMatch\[\] \}/);
  // 대회가 끝나 예정이 0건이면 이 블록을 아예 안 그린다
  assert.match(cover, /const \[next, \.\.\.rest\] = upcoming/);
  assert.match(cover, /\{next \? \(/);
  // 이 페이지에서 가장 자주 바뀌는 정보다 — 좁은 곁칸이 아니라 제목 아래 전체 폭을 쓴다
  assert.doesNotMatch(cover, /md:w-\[24rem\]/);
  // 그 다음 두 경기는 오른쪽 좁은 칸에 위아래로 붙는다 — 좌우로 찢어놓으면 한 묶음으로 안 읽힌다
  assert.match(cover, /rest\.slice\(0, 2\)/);
  assert.match(cover, /md:grid-cols-5/);
  assert.match(cover, /rest\.length \? "md:col-span-3" : "md:col-span-5"/);
  assert.match(cover, /md:col-span-2/);
  assert.match(cover, /divide-y/);
  // 시각·조 색·로고는 lib 상수와 공용 함수에서만 온다
  assert.match(cover, /JUNGMAN_MATCH_TIME/);
  assert.match(cover, /JUNGMAN_GROUP_COLORS/);
  assert.match(cover, /jungmanTeamByName\(name\)\?\.code/);
});

// ── 순위표 펼침 (팀을 누르면 지난/남은 경기) ─────────────────────────────
test("순위표는 클라이언트 컴포넌트고 경기 전체를 받는다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  assert.match(source, /^"use client";/);
  assert.match(source, /matches: JungmanStandingsMatch\[\]/);

  // 예정 경기가 빠지면 '남은 경기'가 통째로 사라진다 — sortJungmanMatches 결과를 넘기면 안 된다
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(
    page,
    /<JungmanGroupTables\s+tables=\{tables\}[\s\S]{0,200}matches=\{standings\?\.matches \?\? \[\]\}/
  );
});

test("팀 행이 눌리는 버튼이고 펼침 상태를 알린다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  assert.match(source, /<button[\s\S]{0,200}aria-expanded=\{expanded\}/);
  assert.match(source, /onClick=\{\(\) => onToggle\(row\.team\)\}/);
  // 한 번에 한 팀만 — 같은 팀을 다시 누르면 닫힌다
  assert.match(source, /current === team \? null : team/);
});

test("지난 경기 줄을 누르면 세트별 대진이 펼쳐진다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");

  // 세트가 있는 경기만 눌린다 — 없으면 예전처럼 그냥 <div> 한 줄
  assert.match(source, /const sets = match\.sets \?\? \[\]/);
  assert.match(source, /sets\.length && onToggle \? \(/);
  assert.match(source, /<button[\s\S]{0,80}aria-expanded=\{open\}/);
  assert.match(source, /<div className=\{LINE\}>\{line\}<\/div>/);

  // 좌우는 홈·원정 자리로 고정하고 가운데가 맵 — 이긴 선수를 왼쪽으로 몰면 소속이 안 보인다
  assert.match(
    source,
    /\{set\.home\}<\/span>[\s\S]{0,120}\{set\.map\}<\/span>[\s\S]{0,120}\{set\.away\}<\/span>/
  );
  // 이긴 쪽은 밝게, 진 쪽은 흐리게. 진행 중(null)이면 양쪽 다 보통
  assert.match(source, /if \(winner === null\) return "font-bold text-\[rgba\(232,235,242,0\.62\)\]"/);
  assert.match(source, /winner === side \? "font-black text-\[#e8ebf2\]" : "font-bold/);
  // 한 줄은 번호 · 홈 · 맵 · 원정 네 칸뿐이다 — 종족 배지 자리는 없다(선수 DB를 안 읽는다)
  assert.match(source, /grid-cols-\[1\.4rem_1fr_1fr_1fr\]/);

  // 한 번에 한 경기만. 다른 팀을 펼치면 TeamMatches가 언마운트돼 저절로 닫힌다
  assert.match(source, /current === `p\$\{index\}` \? null : `p\$\{index\}`/);
  // /jungman은 세트를 전부 보여준다 — 5개로 자르는 건 자리가 좁은 덱뿐이다
  assert.doesNotMatch(source, /sets\.slice\(/);
});

test("펼침 화면의 '오늘'도 마운트 뒤에 채운다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  // 서버 스냅샷이 null이라 D-day는 하이드레이션 뒤에 생긴다 — useState+useEffect면 불일치를 스스로 만든다
  assert.match(source, /useSyncExternalStore\(/);
  assert.match(source, /\(\) => jungmanTodayKST\(\),\s*\(\) => null/);
  assert.doesNotMatch(source, /useEffect\(/);
  // 시계를 읽는 곳은 그 스냅샷 딱 한 곳뿐이다 (오늘은 lib 함수가 준다)
  assert.equal((source.match(/jungmanTodayKST\(\)|new Date\(\)|Date\.now\(\)/g) || []).length, 1);
  // D-day는 오늘을 인자로 받는다 — 함수가 제 안에서 시계를 읽으면 그 보호가 깨진다
  assert.match(source, /jungmanDdayLabel\(match\.date, today\)/);
});

// ── 개인 순위 (홈 덱 슬라이드 2) ─────────────────────────────────────────
const sm = (home, away, sets) => ({ group: "A", home, away, homeSets: 0, awaySets: 0, sets });
const shapeRanks = (ranks) => ranks.map((r) => [r.name, r.team, r.wins, r.losses]);

test("세트 승자에서 선수 승패가 홈·원정 양쪽으로 집계된다", () => {
  const ranks = buildJungmanPlayerRanks([
    sm("가팀", "나팀", [set("맵1", "가1", "나1", "home"), set("맵2", "가1", "나2", "away")]),
  ]);
  // 나2(1승 승률1) > 가1(1승 승률.5) > 나1(0승)
  assert.deepEqual(shapeRanks(ranks), [
    ["나2", "나팀", 1, 0],
    ["가1", "가팀", 1, 1],
    ["나1", "나팀", 0, 1],
  ]);
  // 세트가 아예 없는 경기는 아무것도 만들지 않는다
  assert.deepEqual(buildJungmanPlayerRanks([{ group: "A", home: "가팀", away: "나팀", homeSets: 2, awaySets: 0 }]), []);
});

test("승자가 null인 세트는 안 센다", () => {
  assert.deepEqual(buildJungmanPlayerRanks([sm("가팀", "나팀", [set("맵1", "가1", "나1", null)])]), []);
  const ranks = buildJungmanPlayerRanks([
    sm("가팀", "나팀", [set("맵1", "가1", "나1", "home"), set("맵2", "가1", "나1", null)]),
  ]);
  assert.deepEqual(shapeRanks(ranks), [
    ["가1", "가팀", 1, 0],
    ["나1", "나팀", 0, 1],
  ]);
});

test("이름이 빈 세트는 안 센다 (승자만 찍은 경우)", () => {
  const ranks = buildJungmanPlayerRanks([
    sm("가팀", "나팀", [
      set("", "", "", "home"), // 승자만 — 양쪽 다 안 센다
      set("맵1", "가1", "", "away"), // 원정 이름만 비었다 — 가1의 패만 센다
      set("맵2", "가1", "나1", "home"),
    ]),
  ]);
  assert.deepEqual(shapeRanks(ranks), [
    ["가1", "가팀", 1, 1],
    ["나1", "나팀", 0, 1],
  ]);
});

test("다승 → 승률 → 이름 순으로 정렬된다", () => {
  const ranks = buildJungmanPlayerRanks([
    sm("가팀", "나팀", [
      set("m", "다승자", "나1", "home"),
      set("m", "다승자", "나1", "home"),
      set("m", "다승자", "나1", "home"),
      set("m", "덜깔끔", "나2", "home"),
      set("m", "덜깔끔", "나2", "home"),
      set("m", "덜깔끔", "나2", "home"),
      set("m", "덜깔끔", "나2", "away"), // 3승 1패 — 다승자와 승수는 같고 승률이 낮다
      set("m", "동률가", "나3", "home"),
      set("m", "동률가", "나3", "away"),
      set("m", "동률나", "나4", "home"),
      set("m", "동률나", "나4", "away"),
    ]),
  ]);
  // 승수 → 승률 → 이름. 1승 무리는 승률 .5 넷이 이름 순으로 서고 승률 .25가 뒤로 밀린다
  assert.deepEqual(
    ranks.map((r) => [r.name, r.wins, r.losses]),
    [
      ["다승자", 3, 0],
      ["덜깔끔", 3, 1],
      ["나3", 1, 1],
      ["나4", 1, 1],
      ["동률가", 1, 1],
      ["동률나", 1, 1],
      ["나2", 1, 3],
      ["나1", 0, 3],
    ]
  );
});

test("소속은 그 선수가 가장 많이 뛴 팀", () => {
  const ranks = buildJungmanPlayerRanks([
    sm("다팀", "나팀", [set("m", "떠돌이", "나1", "home")]),
    sm("가팀", "나팀", [set("m", "떠돌이", "나1", "home"), set("m", "떠돌이", "나1", "away")]),
  ]);
  assert.equal(ranks.find((r) => r.name === "떠돌이").team, "가팀");

  // 동수면 먼저 나온 팀
  const tied = buildJungmanPlayerRanks([
    sm("다팀", "나팀", [set("m", "떠돌이", "나1", "home")]),
    sm("가팀", "나팀", [set("m", "떠돌이", "나1", "home")]),
  ]);
  assert.equal(tied.find((r) => r.name === "떠돌이").team, "다팀");
});

test("공개 페이지가 개인 순위를 경기 결과와 나란히 그린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /buildJungmanPlayerRanks\(standings\?\.matches \?\? \[\]\)/);
  assert.match(page, /<JungmanPlayerRanks ranks=\{playerRanks\} players=\{players\}/);
  // 한 grid 안에 나란히 — 경기 결과가 왼쪽(넓게), 개인 순위가 오른쪽
  assert.match(page, /md:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,1fr\)\][\s\S]{0,400}<JungmanMatchResults[\s\S]{0,200}<JungmanPlayerRanks/);
  // 자식이 가진 mt와 grid의 mt가 겹치면 두 칸의 윗선이 어긋난다
  assert.match(page, /\[&>\*\]:mt-0/);

  const source = readProjectFile("app/jungman/JungmanPlayerRanks.tsx");
  // 서버에서 그린다 — 공개 화면에 클라이언트 번들을 늘리지 않는다
  assert.doesNotMatch(source, /"use client"/);
  // 홈 덱과의 차별점은 종족 배지다 — 선수 DB를 읽을 수 있는 화면이다
  assert.match(source, /raceOfName\(players, rank\.name\)/);
  assert.match(source, /<RaceLetterBadge race=\{race\} size="sm"/);
  // 못 찾으면 배지 없이 이름만 (선수 DB가 비어도 멀쩡해야 한다)
  assert.match(source, /race \? <RaceLetterBadge[\s\S]{0,60}: null/);
  // TOP 10에서 자른다 — 열두 팀 전원을 늘어놓으면 곁칸이 아니라 벽이 된다
  assert.match(source, /ranks\.slice\(0, 10\)/);
  // 비면 아예 그리지 않는다 — 제목만 남은 빈 패널이 생기면 안 된다
  assert.match(source, /if \(!ranks\.length\) return null/);
  // 로고·팀 조회는 공용 함수에서만 온다
  assert.match(source, /jungmanTeamByName\(rank\.team\)\?\.code/);
  assert.match(source, /jungmanLogoPath\(code\)/);
});

test("개인 순위가 동결 티어를 이름 옆에 알린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  // KV 읽기는 서버에서 한 번. 동결 하나 때문에 순위 페이지가 죽으면 안 되니 실패는 catch로 삼킨다
  assert.match(page, /getSetting\(TIER_FREEZE_KEY\)[\s\S]{0,80}\.then\(parseTierFreeze\)[\s\S]{0,200}\.catch\(/);
  assert.match(page, /<JungmanPlayerRanks[^>]*freeze=\{freeze\}/);

  const source = readProjectFile("app/jungman/JungmanPlayerRanks.tsx");
  // 판정은 공용 계약이 한다 — 여기서 스냅샷을 직접 뒤지면 규칙이 두 벌이 된다
  assert.match(source, /frozenTierOf\(freeze, hit\.id, hit\.tier\)/);
  // 동결이 꺼졌거나(freeze=null) 티어 변동이 없으면 아무것도 안 그린다
  assert.match(source, /frozen \? \([\s\S]{0,400}\) : null/);
  assert.match(source, /❄\{frozen\}/);
  assert.match(source, /title=\{`동결 \$\{frozen\}티어/);
  // 이름은 잘려도 배지는 밀리지 않는다
  assert.match(source, /shrink-0[^"]*text-\[#d4a94a\]/);

  // 이름 → 선수 찾기 규칙은 lib 한 벌이다. 복제하면 종족은 붙는데
  // 동결은 안 붙는 선수가 생긴다 — 두 벌로 적는 것을 막는다
  assert.match(source, /playerOfName\(players, rank\.name\)/);
  assert.doesNotMatch(source, /p\.name === n \|\| p\.nickname === n/);
  assert.match(readProjectFile("lib/overlay-race.ts"), /export function playerOfName/);
});

// ── 진출 경우의 수 ────────────────────────────────────────────────────────
const standingsOf = (teams, matches) =>
  parseJungmanStandings(
    JSON.stringify({ announced: true, groups: [{ name: "A", teams }], matches })
  );
/** 팀 이름 → 시나리오 */
const scenariosOf = (data, groupName = "A") =>
  Object.fromEntries(buildJungmanScenarios(data).get(groupName).map((s) => [s.team, s]));

const ABC = ["가", "나", "다"];

test("경기를 하나도 안 치렀으면 아무도 확정이 아니다", () => {
  // 일정만 있는 상태(지금의 /jungman) — 뱃지가 하나도 안 붙어야 한다
  const scheduled = scenariosOf(
    standingsOf(ABC, [
      { group: "A", home: "가", away: "나", homeSets: 0, awaySets: 0, date: "2026-08-08" },
      { group: "A", home: "가", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-09" },
      { group: "A", home: "나", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
    ])
  );
  // 다음 경기(가장 이른 남은 경기)는 문구가 쓸 재료라 함께 실려 나온다
  const next = { 가: ["나", "2026-08-08"], 나: ["가", "2026-08-08"], 다: ["가", "2026-08-09"] };
  for (const team of ABC) {
    assert.deepEqual(
      scheduled[team],
      {
        team,
        clinched: false,
        eliminated: false,
        winClinches: false,
        lossEliminates: false,
        nextOpponent: next[team][0],
        nextDate: next[team][1],
      },
      `team=${team}`
    );
  }
  // 경기 데이터가 아예 없어도 마찬가지 — 셋이 완전 동률이라 아무 말도 못 한다
  const empty = scenariosOf(standingsOf(ABC, []));
  for (const team of ABC) {
    assert.equal(empty[team].clinched, false, `team=${team}`);
    assert.equal(empty[team].eliminated, false, `team=${team}`);
  }
});

test("2승이면 진출 확정, 남은 둘은 다음 경기가 진출·탈락을 가른다", () => {
  const s = scenariosOf(
    standingsOf(ABC, [
      match("A", "가", "나", 5, 0),
      match("A", "가", "다", 5, 0),
      { group: "A", home: "나", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
    ])
  );
  // 3팀 조에서 2승이면 무조건 1위다
  assert.equal(s["가"].clinched, true);
  assert.equal(s["가"].eliminated, false);
  // 이미 끝난 얘기를 또 하지 않는다
  assert.equal(s["가"].winClinches, false);
  assert.equal(s["가"].lossEliminates, false);

  // 나·다는 마지막 경기가 그대로 2위 자리다 — 이기면 진출, 지면 탈락
  for (const team of ["나", "다"]) {
    assert.equal(s[team].clinched, false, `team=${team}`);
    assert.equal(s[team].eliminated, false, `team=${team}`);
    assert.equal(s[team].winClinches, true, `team=${team}`);
    assert.equal(s[team].lossEliminates, true, `team=${team}`);
  }
});

test("2패면 탈락 확정 — 나머지 둘은 지고도 진출한다", () => {
  const s = scenariosOf(
    standingsOf(ABC, [
      match("A", "가", "나", 5, 0),
      match("A", "다", "나", 5, 0),
      { group: "A", home: "가", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
    ])
  );
  assert.equal(s["나"].eliminated, true);
  assert.equal(s["나"].clinched, false);
  assert.equal(s["나"].winClinches, false);
  assert.equal(s["나"].lossEliminates, false);
  // 나가 0승으로 바닥에 깔려 있어 가·다는 마지막 경기 결과와 무관하게 1·2위다
  for (const team of ["가", "다"]) {
    assert.equal(s[team].clinched, true, `team=${team}`);
    assert.equal(s[team].winClinches, false, `team=${team}`);
    assert.equal(s[team].lossEliminates, false, `team=${team}`);
  }
});

test("순환 동률이 남아 있으면 확정이라고 말하지 않는다", () => {
  // 가 5:0 나, 다 5:0 가 → 남은 건 나 vs 다.
  // 나가 5:0으로 이기면 셋 다 1승1패·세트득실 0·세트승 5로 완전 동률이 되고,
  // 맞대결도 가>나>다>가로 물고 물려(각 1승) 승자승으로도 못 가른다.
  const s = scenariosOf(
    standingsOf(ABC, [
      match("A", "가", "나", 5, 0),
      match("A", "다", "가", 5, 0),
      { group: "A", home: "나", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
    ])
  );
  // 팀명 순이면 '가'가 언제나 2위 안이라 확정처럼 보인다 — 그게 거짓말이다
  for (const team of ABC) {
    assert.equal(s[team].clinched, false, `team=${team}`);
    assert.equal(s[team].eliminated, false, `team=${team}`);
  }
  // 순위표도 같은 규칙을 쓴다 — 그 순환이 실제로 일어나면 팀명 순으로 남는다
  const cycled = standingsOf(ABC, [
    match("A", "가", "나", 5, 0),
    match("A", "다", "가", 5, 0),
    match("A", "나", "다", 5, 0),
  ]);
  assert.deepEqual(rowsOf(cycled, "A").map((row) => row.team), ABC);
  // 나는 지면 0승2패라 확실히 탈락이다 — 동률 규칙이 이쪽까지 뭉개면 안 된다
  assert.equal(s["나"].lossEliminates, true);
  assert.equal(s["나"].winClinches, false);
  // 가는 남은 경기가 없다 — 다음 경기 얘기를 만들어내면 안 된다
  assert.equal(s["가"].winClinches, false);
  assert.equal(s["가"].lossEliminates, false);
});

test("승자승으로 갈리는 동률은 확정으로 센다", () => {
  // 4팀 조. 가·나는 2승1패·세트득실 +1·세트승 10으로 완전 동률이고 맞대결은 가가 5:0으로 이겼다.
  // 남은 건 라 vs 다 한 경기:
  //  - 라가 이기면 라가 1위, 가·나가 2·3위 동률 → 맞대결로 가가 2위
  //  - 다가 이기면 가·나(2승)가 1·2위
  // 어느 쪽이든 가는 2위 안이다. 승자승이 없으면 앞 갈래를 "모른다"로 흘려보냈다.
  const data = standingsOf(["가", "나", "다", "라"], [
    match("A", "가", "나", 5, 0), // 맞대결 — 가 승
    match("A", "라", "가", 5, 0),
    match("A", "나", "라", 5, 4),
    match("A", "가", "다", 5, 4),
    match("A", "나", "다", 5, 0),
    { group: "A", home: "라", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
  ]);
  // 동률 전제부터 확인한다 — 여기가 어긋나면 아래 단언은 아무 의미가 없다
  assert.deepEqual(
    rowsOf(data, "A").map((row) => [row.team, row.wins, row.setsWon, row.setDiff]),
    [
      ["가", 2, 10, 1],
      ["나", 2, 10, 1],
      ["라", 1, 9, 4],
      ["다", 0, 4, -6],
    ]
  );

  const s = scenariosOf(data);
  assert.equal(s["가"].clinched, true);
  assert.equal(s["가"].eliminated, false);
  // 나는 라가 이기는 갈래에서 맞대결에 밀려 3위다 — 확정도 탈락도 아니다
  assert.equal(s["나"].clinched, false);
  assert.equal(s["나"].eliminated, false);
  // 다는 이겨도 1승2패라 2승인 가·나를 못 넘는다
  assert.equal(s["다"].eliminated, true);
  assert.equal(s["라"].clinched, false);
  assert.equal(s["라"].eliminated, false);
});

test("오타 팀명·다른 조 경기가 섞여도 안 죽는다", () => {
  const data = standingsOf(ABC, [
    match("A", "가", "없는팀", 5, 0), // 오타 — 계산에서 통째로 뺀다
    { group: "A", home: "나", away: "없는팀2", homeSets: 0, awaySets: 0, date: "2026-08-08" },
    match("B", "가", "나", 5, 0), // 다른 조
    match("A", "가", "나", 5, 0),
    match("A", "가", "다", 5, 0),
  ]);
  const s = scenariosOf(data);
  assert.deepEqual(Object.keys(s).sort(), ABC.slice().sort());
  // 오타 경기가 빠져도 가의 2승은 그대로 남는다
  assert.equal(s["가"].clinched, true);
  // 조가 아예 없는 이름을 물으면 빈 배열로 떨어져야 한다(화면이 ?? []로 받는다)
  assert.equal(buildJungmanScenarios(data).get("없는조"), undefined);
});

test("경우의 수 계산이 원본을 건드리지 않는다", () => {
  const data = standingsOf(ABC, [
    match("A", "가", "나", 5, 0),
    { group: "A", home: "나", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-10" },
    { group: "A", home: "가", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-11" },
  ]);
  const before = JSON.stringify(data);
  const first = buildJungmanScenarios(data);
  assert.equal(JSON.stringify(data), before);
  // 같은 입력이면 같은 답 — 전수 조사가 상태를 남기면 안 된다
  assert.deepEqual([...buildJungmanScenarios(data)], [...first]);
});

test("공개 페이지가 경우의 수를 넘기고 순위표가 그린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /buildJungmanScenarios\(standings\)/);
  assert.match(page, /scenarios=\{scenarios\}/);

  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  // 진출선은 계산과 화면이 같은 상수를 본다 — 두 벌이면 점선과 뱃지가 조용히 어긋난다
  assert.match(source, /ADVANCING = JUNGMAN_ADVANCING/);
  // 문구는 lib에서만 온다 — 행 안은 알약, 긴 문장은 펼쳤을 때만
  assert.match(source, /jungmanScenarioBadge\(scenario\)/);
  assert.match(source, /jungmanScenarioLine\(scenario\)/);
});

// ── 상태 문구 (알약 · 한 줄) ──────────────────────────────────────────────
const { jungmanScenarioBadge, jungmanScenarioLine } = loadModule("lib/jungman-standings.ts");
const scenario = (over) => ({
  team: "HM",
  clinched: false,
  eliminated: false,
  winClinches: false,
  lossEliminates: false,
  ...over,
});

test("알약은 세 값만 돌려준다", () => {
  const seen = new Set();
  for (const over of [
    {},
    { clinched: true },
    { eliminated: true },
    { winClinches: true },
    { lossEliminates: true },
    { winClinches: true, lossEliminates: true },
    { nextOpponent: "CALM", nextDate: "2026-08-23" },
  ]) {
    seen.add(jungmanScenarioBadge(scenario(over)));
  }
  assert.deepEqual([...seen].sort(), ["경우의 수", "진출 확정", "탈락"].sort());
  // 확정이 탈락보다 먼저 걸린다(둘 다 참일 수는 없지만 순서를 못 박아 둔다)
  assert.equal(jungmanScenarioBadge(scenario({ clinched: true, eliminated: true })), "진출 확정");
});

test("한 줄에 팀 이름 · 상대 · 날짜가 다 들어간다", () => {
  const next = { nextOpponent: "CALM", nextDate: "2026-08-23" };
  assert.equal(
    jungmanScenarioLine(scenario({ ...next, winClinches: true, lossEliminates: true })),
    "HM — 8/23 CALM전 이기면 진출, 지면 탈락"
  );
  assert.equal(
    jungmanScenarioLine(scenario({ ...next, winClinches: true })),
    "HM — 8/23 CALM전 이기면 진출 확정"
  );
  assert.equal(
    jungmanScenarioLine(scenario({ ...next, lossEliminates: true })),
    "HM — 8/23 CALM전 지면 탈락"
  );
  // 확정된 얘기에는 다음 경기가 안 붙는다
  assert.equal(jungmanScenarioLine(scenario({ ...next, clinched: true })), "HM — 8강 진출 확정");
  assert.equal(jungmanScenarioLine(scenario({ ...next, eliminated: true })), "HM — 탈락 확정");
  // 아무 말도 못 하는 팀도 빈 문자열이 아니다 — 펼치면 반드시 한 줄이 있다
  assert.equal(jungmanScenarioLine(scenario(next)), "HM — 남은 경기 결과에 따라 갈린다");
});

test("날짜가 없으면 날짜만 빠진다", () => {
  assert.equal(
    jungmanScenarioLine(scenario({ nextOpponent: "CALM", winClinches: true })),
    "HM — CALM전 이기면 진출 확정"
  );
  // 상대까지 없어도(있을 수 없지만) 문장이 깨지지 않는다
  assert.equal(jungmanScenarioLine(scenario({ lossEliminates: true })), "HM — 다음 경기에서 지면 탈락");
});

test("두 화면은 상태 문구를 직접 적지 않는다", () => {
  const lib = readProjectFile("lib/jungman-standings.ts");
  for (const line of ["진출 확정", "탈락", "경우의 수", "남은 경기 결과에 따라 갈린다"]) {
    assert.ok(lib.includes(line), `lib에 없음: ${line}`);
  }
  // 화면이 같은 문구를 또 적으면 두 벌이 되어 조용히 어긋난다.
  // 주석에는 나올 수 있으니 문자열 리터럴·JSX 텍스트로 나오는 것만 잡는다
  const hardcoded = /(["'`]\s*(진출 확정|탈락|경우의 수)\s*["'`])|(>\s*(진출 확정|탈락|경우의 수)\s*<)/;
  for (const file of ["app/jungman/JungmanGroupTables.tsx", "components/home/HomeHeroDeck.tsx"]) {
    const source = readProjectFile(file);
    assert.doesNotMatch(source, hardcoded, `${file}에 상태 문구가 하드코딩돼 있다`);
    assert.doesNotMatch(source, /이기면 진출|지면 탈락/, `${file}에 경우의 수 문장이 하드코딩돼 있다`);
    assert.match(source, /jungmanScenarioBadge|jungmanScenarioLine/);
  }
});

test("누른 순간이 보인다 — 움직임은 reduced-motion에서 꺼진다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  assert.match(source, /active:scale-\[0\.985\]/);
  assert.match(source, /active:bg-\[rgba\(155,185,240,0\.1\)\]/);
  assert.match(source, /duration-\[120ms\]/);
  // 움직임을 싫어하는 사람에게는 배경 변화만 남긴다
  assert.match(source, /motion-reduce:active:scale-100/);
  // 눌리는 곳 두 군데(팀 행 · 경기 줄)가 같은 효과를 쓴다 — 두 벌로 적으면 어긋난다
  assert.equal((source.match(/\$\{PRESS\}/g) ?? []).length, 2);
});

// ── 날짜·D-day 공용 함수 ────────────────────────────────────────────────
const { jungmanDateLabel, jungmanDaysUntil, jungmanDdayLabel, jungmanTodayKST, jungmanWeekdayIndex } =
  loadModule("lib/jungman.ts");

test("날짜 라벨은 8/8(토) 꼴이고 앞자리 0을 안 붙인다", () => {
  assert.equal(jungmanDateLabel("2026-08-08"), "8/8(토)");
  assert.equal(jungmanDateLabel("2026-09-19"), "9/19(토)");
  assert.equal(jungmanDateLabel("2026-01-01"), "1/1(목)");
  assert.equal(jungmanDateLabel("2026-12-31"), "12/31(목)");
  // 요일은 눈으로 세지 말고 검산한다 — 한 칸만 밀리면 모든 화면이 같이 틀린다.
  // 기준은 한국시간 Intl: 1년치를 통째로 대조해 예전(Intl 조립) 출력과 한 글자도 안 달라졌음을 못 박는다
  const koWeekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });
  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const at = new Date(`${date}T00:00:00+09:00`);
    assert.equal(jungmanDateLabel(date), `${monthDay.format(at)}(${koWeekday.format(at)})`, `date=${date}`);
    // 홈 커버 달력이 첫 칸을 띄우는 데 쓰는 값 — 하루만 밀려도 격자가 통째로 어긋난다
    assert.equal(jungmanWeekdayIndex(date), WEEKDAYS.indexOf(koWeekday.format(at)), `date=${date}`);
  }
});

test("D-day는 오늘·내일·D-N이고 지난 날짜는 null", () => {
  const today = "2026-08-08";
  assert.equal(jungmanDdayLabel("2026-08-08", today), "오늘");
  assert.equal(jungmanDdayLabel("2026-08-09", today), "내일");
  assert.equal(jungmanDdayLabel("2026-08-11", today), "D-3");
  assert.equal(jungmanDdayLabel("2026-09-19", today), "D-42");
  // 결과가 안 들어온 지난 경기에 거짓 숫자를 붙이지 않는다
  assert.equal(jungmanDdayLabel("2026-08-07", today), null);
  assert.equal(jungmanDaysUntil("2026-08-07", today), -1);
  assert.equal(jungmanDaysUntil("2026-09-19", today), 42);
  // 달·해를 넘어도 산수는 그대로 (서머타임 없는 KST 기준)
  assert.equal(jungmanDdayLabel("2026-09-01", "2026-08-31"), "내일");
  assert.equal(jungmanDaysUntil("2027-01-01", "2026-12-25"), 7);
});

test("오늘을 넘겨주면 브라우저 시간대와 무관하게 같은 값이 나온다", () => {
  // 클라이언트 화면(순위표 펼침·홈 덱 달력)이 제 시점을 넘기는 길 — 시계를 안 읽는다
  for (const today of ["2026-08-08", "2026-08-09"]) {
    assert.equal(jungmanDdayLabel("2026-08-09", today), today === "2026-08-09" ? "오늘" : "내일");
  }
  // 라벨은 시계를 아예 안 본다 — 몇 번을 불러도 같은 문자열
  assert.equal(jungmanDateLabel("2026-08-08"), jungmanDateLabel("2026-08-08"));

  // 오늘(한국 날짜)은 en-CA(Asia/Seoul)와 같은 값이어야 한다 — 서버가 UTC라도 마찬가지
  const seoul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  assert.match(jungmanTodayKST(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(jungmanTodayKST(), seoul.format(new Date()));
  // 인자를 안 주면 오늘 기준 — 오늘은 언제나 "오늘"이다
  assert.equal(jungmanDdayLabel(jungmanTodayKST()), "오늘");
});

test("날짜 포맷을 화면이 다시 만들지 않는다 (복제 금지)", () => {
  for (const file of [
    "app/jungman/JungmanCover.tsx",
    "app/jungman/JungmanGroupTables.tsx",
    "app/jungman/JungmanMatchResults.tsx",
    "app/jungman/JungmanSchedule.tsx",
    "app/jungman/JungmanBracket.tsx",
    "components/home/HomeHeroDeck.tsx",
  ]) {
    const source = readProjectFile(file);
    // 화면마다 포맷터를 두면 한쪽만 고쳐져 같은 경기의 날짜가 갈라진다
    assert.doesNotMatch(source, /new Intl\.DateTimeFormat/, file);
    // D-day 산수도 lib 한 곳에서만 — 86_400_000이 화면에 나오면 그게 두 번째 계산이다
    assert.doesNotMatch(source, /86_400_000/, file);
    assert.match(source, /jungmanDateLabel|jungmanDdayLabel|jungmanDaysUntil/, file);
  }
});

// ── 커버 링크 · 날짜 칸 ──────────────────────────────────────────────────
test("커버가 공식 방송국과 승부예측으로 나간다", () => {
  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  // 방송국은 새 탭 — 외부 링크에 opener를 넘기면 안 된다
  assert.match(cover, /href="https:\/\/www\.sooplive\.com\/station\/ititit"/);
  assert.match(cover, /target="_blank"/);
  assert.match(cover, /rel="noopener/);
  // 승부예측 버튼은 공용 부품이다 — /asl 커버와 같은 옷. 스타일 두 벌 금지
  assert.match(cover, /<PredictionCta/);
  const cta = readProjectFile("components/prediction/PredictionCta.tsx");
  // 사이트 안 이동이다 — <a>로 나가면 페이지를 통째로 다시 받는다
  assert.match(cta, /import Link from "next\/link"/);
  assert.match(cta, /<Link\s+href="\/prediction"/);
});

test("커버의 다음 두 경기가 시각까지 그리고 그 칸은 안 잘린다", () => {
  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  // 시각은 lib 상수에서만 온다 — 두 벌로 적으면 조용히 어긋난다
  assert.match(cover, /\$\{jungmanDateLabel\(match\.date\)\} \$\{JUNGMAN_MATCH_TIME\}/);
  // 날짜+시각 칸은 줄지도 잘리지도 않는다 (잘릴 몫은 팀 이름이 진다)
  // [^<]는 다른 태그로 넘어가지 않게 잡아둔다 — 엉뚱한 className을 물면 검사가 헛돈다
  const cell = cover.match(/className="([^"]*)"[^<]{0,200}\{match\.date \? `\$\{jungmanDateLabel/);
  assert.ok(cell, "커버의 날짜 칸을 못 찾았다");
  assert.ok(/shrink-0/.test(cell[1]) && /whitespace-nowrap/.test(cell[1]), cell[1]);
  assert.ok(/truncate/.test(cover.match(/<span className="([^"]*)">\s*\{match\.home\}/)[1]));
});

test("펼침 경기 줄의 날짜 칸도 안 잘린다", () => {
  const source = readProjectFile("app/jungman/JungmanGroupTables.tsx");
  const cell = source.match(/<span className="([^"]*)">\s*\{head\}/);
  assert.ok(cell, "펼침의 날짜 칸을 못 찾았다");
  assert.ok(/shrink-0/.test(cell[1]) && /whitespace-nowrap/.test(cell[1]), cell[1]);
  assert.ok(!/truncate/.test(cell[1]), cell[1]);
  // 넓은 화면에서는 시각까지 들어간다 — 첫 칸이 그만큼 넓어야 안 넘친다
  assert.match(source, /md:grid-cols-\[4\.8rem_1fr_auto_1fr_2\.4rem\]/);
  assert.match(source, /JUNGMAN_MATCH_TIME/);
});

// ── 토너먼트 (8강 · 4강 · 결승) ──────────────────────────────────────────
// 조가 없는 경기는 group 칸에 라운드 이름을 넣어 같은 matches 배열에 산다.
// 스키마를 안 바꾸는 대신, 순수 함수들이 정말 저절로 갈라주는지 여기서 못 박는다.
const withTournament = () =>
  parseJungmanStandings(
    JSON.stringify({
      announced: true,
      groups: [{ name: "A조", teams: ["가", "나", "다"] }],
      matches: [
        { group: "A조", home: "가", away: "나", homeSets: 5, awaySets: 3, date: "2026-08-08" },
        { group: "A조", home: "가", away: "다", homeSets: 0, awaySets: 0, date: "2026-08-16" },
        { group: "8강", home: "가", away: "라", homeSets: 5, awaySets: 2, date: "2026-09-03" },
        { group: "4강", home: "가", away: "마", homeSets: 0, awaySets: 0, date: "2026-09-12" },
      ],
    })
  );

test("토너먼트 경기는 파서를 그대로 통과한다 (group에 라운드 이름)", () => {
  const data = withTournament();
  assert.deepEqual(
    data.matches.map((m) => [m.group, m.decided]),
    [
      ["A조", true],
      ["A조", false],
      ["8강", true],
      ["4강", false],
    ]
  );
});

test("토너먼트 경기는 순위표에 안 들어간다 (조 이름이 아니라서 저절로 빠진다)", () => {
  const rows = rowsOf(withTournament(), "A조").map((row) => [row.team, row.wins, row.losses, row.setsWon, row.remaining]);
  // 가는 8강에서 5:2로 이겼지만 조별 전적은 1승 5세트 그대로다
  assert.deepEqual(rows, [
    ["가", 1, 0, 5, 1],
    ["다", 0, 0, 0, 2],
    ["나", 0, 1, 3, 1],
  ]);
  // 조 이름으로만 표를 만든다 — "8강"이라는 표가 생기면 안 된다
  assert.deepEqual(
    buildJungmanGroupTables(withTournament()).map((t) => t.name),
    ["A조"]
  );
});

test("토너먼트 경기는 경우의 수에도 안 들어간다", () => {
  const data = withTournament();
  assert.deepEqual([...buildJungmanScenarios(data).keys()], ["A조"]);
  const s = scenariosOf(data, "A조");
  // 남은 경기는 조별리그 8/16 한 건뿐이다 — 9/12 4강이 '다음 경기'로 잡히면 안 된다
  assert.equal(s["가"].nextOpponent, "다");
  assert.equal(s["가"].nextDate, "2026-08-16");
  assert.equal(s["나"].nextOpponent, undefined);
});

test("토너먼트 경기는 일정·경기 결과에는 섞인다", () => {
  const data = withTournament();
  // 끝난 8강은 최신순 결과 목록 맨 위 (9/3 > 8/8)
  assert.deepEqual(
    sortJungmanMatches(data.matches).map((m) => [m.group, m.date]),
    [
      ["8강", "2026-09-03"],
      ["A조", "2026-08-08"],
    ]
  );
  // 예정 4강은 일정에 가까운 날짜 순으로 들어온다
  assert.deepEqual(
    upcomingJungmanMatches(data.matches).map((m) => [m.group, m.date]),
    [
      ["A조", "2026-08-16"],
      ["4강", "2026-09-12"],
    ]
  );
});

test("토너먼트 세트도 개인 순위에 그대로 집계된다", () => {
  const ranks = buildJungmanPlayerRanks([
    { group: "8강", home: "가팀", away: "나팀", homeSets: 0, awaySets: 0, sets: [set("맵1", "가1", "나1", "home")] },
  ]);
  assert.deepEqual(shapeRanks(ranks), [
    ["가1", "가팀", 1, 0],
    ["나1", "나팀", 0, 1],
  ]);
});

test("관리자에 토너먼트 섹션이 있고 구조는 lib 상수에서만 온다", () => {
  const admin = readProjectFile("app/admin/jungman/JungmanStandingsAdmin.tsx");
  assert.match(admin, /JUNGMAN_TOURNAMENT/);
  assert.match(admin, /JUNGMAN_TOURNAMENT\.map\(\(round\) => \{/);
  // 라운드 이름·날짜를 화면에 또 적으면 lib와 조용히 어긋난다
  assert.doesNotMatch(admin, /"8강 1경기"/);
  // 경기를 찾는 열쇠는 라운드 + 날짜다 — 대진이 비어 있어도 같은 줄이어야 한다
  assert.match(admin, /const isRound = \(m: Match, round: string, date: string\) =>\s*m\.group === round && m\.date === date/);
  // group 칸에는 label("8강 1경기")이 아니라 round("8강")가 들어간다
  assert.match(admin, /setRoundTeam\(round\.round, round\.date/);
  assert.match(admin, /editSet\(round\.round, home, away, sets, i, patch, round\.date\)/);
  // 두 팀이 다 비면 그 경기는 저장하지 않는다
  assert.match(admin, /next\.home \|\| next\.away \? \[\.\.\.rest, next\] : rest/);
  // 세트 편집기는 조별리그와 같은 것 하나 — 두 벌로 적으면 조용히 어긋난다
  assert.equal((admin.match(/<SetEditor/g) || []).length, 2);
});

test("공개 페이지가 대진표를 일정과 경기 결과 사이에 그린다", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /<JungmanBracket matches=\{standings\?\.matches \?\? \[\]\}/);
  assert.match(page, /<JungmanCalendar[\s\S]*?<JungmanBracket[\s\S]*?<JungmanMatchResults/);

  const source = readProjectFile("app/jungman/JungmanBracket.tsx");
  // 서버에서 그린다 — 공개 화면에 클라이언트 번들을 늘리지 않는다
  assert.doesNotMatch(source, /"use client"/);
  // 구조(경기 수·날짜)는 lib 상수, 대진·결과는 저장된 경기 — 둘을 라운드+날짜로 잇는다
  assert.match(source, /JUNGMAN_TOURNAMENT\.map/);
  assert.match(source, /m\.group === round\.round && m\.date === round\.date/);
  // 대진이 하나도 없으면 아무것도 안 그린다 (조별리그 진행 중인 지금)
  assert.match(source, /if \(!games\.some\(\(game\) => game\.match\)\) return null/);
  // 안 정해진 자리는 '미정' — 로고도 없다
  assert.match(source, /if \(!name\) \{[\s\S]{0,120}미정/);
  // 달력의 토너먼트 카드와 같은 금색이어야 같은 것으로 읽힌다
  assert.match(source, /const GOLD = "#d4a94a"/);
  // 로고·팀 조회는 공용 함수에서만 온다
  assert.match(source, /jungmanTeamByName\(name\)\?\.code/);
  assert.match(source, /jungmanLogoPath\(code\)/);
});

process.exitCode = failed ? 1 : 0;
