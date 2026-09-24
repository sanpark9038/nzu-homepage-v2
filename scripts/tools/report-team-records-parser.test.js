const assert = require("node:assert/strict");
const test = require("node:test");

const { buildNote, toMatchRow, isSourceAnomaly, summarize } = require("./report-team-records");
const { buildV2Resolver, fetchPlayerMatchesSince } = require("./lib/eloboard-v2");

// 새 API 경기 1건(2026-09-25 실측 모양 축약). 우리 선수는 안아(새 id 277).
function apiMatch(overrides = {}) {
  return {
    id: 2857217,
    division: "women_mix",
    played_on: "2026-08-18",
    map_name: "애티튜드",
    event_name: null,
    round_label: null,
    format_raw: "단판",
    elo_delta: 17.5,
    memo: "승",
    participants: [
      { player_id: 304, name: "라히", race: "T", result: "win" },
      { player_id: 277, name: "안아", race: "P", result: "loss" },
    ],
    ...overrides,
  };
}

test("toMatchRow maps an api match onto the old collector row shape", () => {
  assert.deepEqual(toMatchRow(apiMatch(), 277), {
    date: "2026-08-18",
    opponent: "라히(T)",
    map: "애티튜드",
    // elo_delta는 부호 없는 변동폭 → 우리 승패로 부호를 붙인다(옛 결과 칸 "-14.4" 표기).
    result_text: "-17.5",
    set_score: "단판",
    note: "승",
    is_win: false,
    division: "women_mix",
    source_match_id: 2857217,
  });
  assert.equal(toMatchRow(apiMatch({ elo_delta: null }), 304).result_text, "");
  assert.equal(toMatchRow(apiMatch(), 304).result_text, "+17.5");
  assert.equal(toMatchRow(apiMatch(), 304).opponent, "안아(P)");
});

test("toMatchRow refuses rows where our side or the result is missing", () => {
  assert.equal(toMatchRow(apiMatch(), 999), null);
  assert.equal(
    toMatchRow(apiMatch({ participants: [{ player_id: 277, name: "안아", race: "P", result: "draw" }, { player_id: 1, name: "x", race: "T", result: "draw" }] }), 277),
    null
  );
});

// 옛 비고와 대조한 결과: memo가 있으면 그게 옛 비고다. 비어 있으면 대회 정보가 옮겨간 경우다.
test("buildNote prefers memo and falls back to event, round and format", () => {
  assert.equal(buildNote(apiMatch()), "승");
  assert.equal(
    buildNote(apiMatch({ memo: null, event_name: "LASL 시즌 20", round_label: "8강", format_raw: "5/3(1)" })),
    "LASL 시즌 20 8강 5/3(1)"
  );
  assert.equal(buildNote(apiMatch({ memo: "  ", event_name: null, round_label: null, format_raw: null })), "");
});

test("isSourceAnomaly flags an active player (played since window start) with zero rows only", () => {
  assert.equal(isSourceAnomaly("2026-09-11", 0), true);
  assert.equal(isSourceAnomaly("2026-09-11", 3), false);
  assert.equal(isSourceAnomaly("2024-12-31", 0), false);
  assert.equal(isSourceAnomaly(null, 0), false);
});

test("summarize keeps the window, dedupes by match id and reports a full scan", () => {
  const rows = [
    apiMatch({ id: 3, played_on: "2026-09-11" }),
    apiMatch({ id: 3, played_on: "2026-09-11" }), // 페이지 경계 중복
    apiMatch({ id: 2, played_on: "2025-01-01", participants: [{ player_id: 277, name: "안아", race: "P", result: "win" }, { player_id: 5, name: "히엉", race: "T", result: "loss" }] }),
    apiMatch({ id: 1, played_on: "2024-12-31" }), // 윈도 밖
  ];
  const rec = summarize(
    { name: "안아", entity_id: "eloboard:female:175" },
    { id: 277, via: "soop_id", player: { last_played_on: "2026-09-11" } },
    rows,
    1
  );
  assert.equal(rec.period_total, 2);
  assert.equal(rec.period_wins, 1);
  assert.equal(rec.period_losses, 1);
  assert.equal(rec.period_min_date, "2025-01-01");
  assert.equal(rec.period_max_date, "2026-09-11");
  assert.equal(rec.scan_strategy, "full_scan");
  assert.equal(rec.validation_pass, true);
  assert.equal(rec.entity_id, "eloboard:female:175");
  assert.equal(rec.eloboard_v2_id, 277);
});

test("summarize throws SOURCE_ANOMALY instead of writing zero rows for an active player", () => {
  assert.throws(
    () => summarize({ name: "안아" }, { id: 277, via: "soop_id", player: { last_played_on: "2026-09-11" } }, [], 1),
    (error) => error.code === "SOURCE_ANOMALY"
  );
  const idle = summarize({ name: "휴면" }, { id: 9, via: "soop_id", player: { last_played_on: "2024-05-01" } }, [], 1);
  assert.equal(idle.period_total, 0);
  assert.equal(idle.validation_pass, true);
});

test("resolver prefers the ledger manual id, then a unique soop match, else unmapped", () => {
  const resolve = buildV2Resolver({
    players: [
      { id: 277, soop_id: "DudWN4974" },
      { id: 117, soop_id: "qkrwogus29" },
      { id: 500, soop_id: "twin" },
      { id: 501, soop_id: "twin" },
    ],
    ledgerRows: {
      "eloboard:female:175": { soop_user_id: "dudwn4974" },
      "eloboard:male:59": { soop_user_id: "nomatch", eloboard_v2_id: 58 },
      "eloboard:male:124": { soop_user_id: "parkjaehyeon" },
      "eloboard:female:1": { soop_user_id: "twin" },
    },
    rosterSoopIds: new Map([["eloboard:female:2", "qkrwogus29"]]),
  });
  assert.deepEqual(
    { id: resolve("eloboard:female:175").id, via: resolve("eloboard:female:175").via },
    { id: 277, via: "soop_id" }
  );
  assert.equal(resolve("eloboard:male:59").id, 58);
  assert.equal(resolve("eloboard:male:59").via, "ledger_eloboard_v2_id");
  assert.equal(resolve("eloboard:female:2").id, 117); // 대장에 숲 ID가 없으면 로스터 값
  assert.equal(resolve("eloboard:male:124"), null); // 숲 ID 불일치 → 미연결
  assert.equal(resolve("eloboard:female:1"), null); // 후보 둘 → 연결하지 않는다
  assert.equal(resolve(""), null);
});

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const offset = Number(new URL(url).searchParams.get("offset"));
    const body = pages[offset / 200];
    if (body === undefined) throw new Error(`unexpected offset ${offset}`);
    if (body === "html") {
      return { ok: true, status: 200, headers: new Map([["content-type", "text/html"]]), json: async () => ({}) };
    }
    return { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), json: async () => body };
  };
  return { impl, calls };
}

function page(count, date) {
  return Array.from({ length: count }, (_, i) => ({ id: i, played_on: date, participants: [] }));
}

test("fetchPlayerMatchesSince pages newest-first and stops past the window start", async () => {
  const { impl, calls } = fakeFetch([page(200, "2026-01-01"), [...page(199, "2025-06-01"), ...page(1, "2024-12-30")], page(200, "2024-01-01")]);
  const { matches, pages } = await fetchPlayerMatchesSince(277, "2025-01-01", { fetchImpl: impl, retries: 0 });
  assert.equal(pages, 2);
  assert.equal(matches.length, 400);
  assert.equal(calls.length, 2);
});

test("fetchPlayerMatchesSince stops on a short page", async () => {
  const { impl, calls } = fakeFetch([page(3, "2026-01-01")]);
  const { matches } = await fetchPlayerMatchesSince(277, "2025-01-01", { fetchImpl: impl, retries: 0 });
  assert.equal(matches.length, 3);
  assert.equal(calls.length, 1);
});

// 모르는 응답(HTML·배열 아님·모양 이상)을 "경기 0건"으로 읽으면 기존 파일이 빈 결과로 덮인다.
test("fetchPlayerMatchesSince turns non-JSON and odd shapes into SOURCE_OUTAGE", async () => {
  for (const body of ["html", { error: "x" }, [{ id: 1 }]]) {
    const { impl } = fakeFetch([body]);
    await assert.rejects(
      fetchPlayerMatchesSince(277, "2025-01-01", { fetchImpl: impl, retries: 0 }),
      (error) => error.code === "SOURCE_OUTAGE"
    );
  }
});

test("HTTP errors become SOURCE_OUTAGE after retries", async () => {
  let calls = 0;
  const impl = async () => {
    calls += 1;
    return { ok: false, status: 503, headers: new Map([["content-type", "text/html"]]), json: async () => ({}) };
  };
  await assert.rejects(
    fetchPlayerMatchesSince(277, "2025-01-01", { fetchImpl: impl, retries: 1 }),
    (error) => error.code === "SOURCE_OUTAGE" && /HTTP 503/.test(error.message)
  );
  assert.equal(calls, 2);
});
