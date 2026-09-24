// 선수 1명의 2025-01-01 이후 전적을 엘로보드 새 JSON API로 읽어 matches json(stdout)으로 낸다.
//
// 2026-09 개편으로 옛 게시판 수집 경로(프로필 HTML·여자부 연도 AJAX·혼성 탭·view_list 페이지네이션)는
// 전부 죽었다 — 배경과 선수 식별 규칙은 lib/eloboard-v2.js 머리 주석. 새 API는 한 선수의 경기를
// 여성전·혼성전·남성전 구분 없이 최신순으로 전부 주므로(옛 혼성 탭 30행 제한도 없다) 매번 전량을
// 읽는다. 그래서 책갈피·prior 병합·연도 분할이 필요 없고 scan_strategy는 항상 full_scan이다.
//
// 호출 인자는 export-team-roster-detailed.js가 넘기던 형태 그대로 받는다. 새 경로에서 쓰는 건
// --entity-id(새 id 해석 키)와 --player/--univ/--tier 정도이고, --profile-url·--wr-id·--gender·
// --prior-json·--no-cache·--concurrency는 받기만 하고 쓰지 않는다(호출부 호환).
const { fetchPlayerMatchesSince, loadV2Resolver } = require("./lib/eloboard-v2");

const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const JSON_ONLY = argv.includes("--json-only");
const INCLUDE_MATCHES = argv.includes("--include-matches");

function argValue(flag, fallback = "") {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

function inRange(date) {
  return date >= START_DATE && date <= END_DATE;
}

// 새 API의 elo_delta는 부호 없는 변동폭이다(실측: 안아 204건 전부 양수, 패배 경기도 양수).
// 옛 결과 칸은 선수 관점의 부호 있는 값("+10.5"/"-14.4")이었으므로 우리 승패로 부호를 붙인다.
function formatEloDelta(value, isWin) {
  const n = Math.abs(Number(value));
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "";
  return `${isWin ? "+" : "-"}${n}`;
}

// 비고(note) 대응(2026-09-25 안아 대조: 옛 R2 202경기 중 196경기가 새 API와 짝지어졌고,
// 그중 174경기는 옛 비고 == memo). 나머지 22경기는 memo가 비어 있고 옛 비고에 들어 있던 대회
// 정보가 event_name/round_label로 옮겨졌다("LASL시즌20 8강 A조 1경기" → "LASL 시즌 20"+"8강"+"5/3(1)").
// 그래서 memo를 우선하고, 없을 때만 대회·라운드·경기 방식을 이어 붙인다.
function buildNote(m) {
  const memo = String(m.memo || "").trim();
  if (memo) return memo;
  return [m.event_name, m.round_label, m.format_raw]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ");
}

// 새 API 경기 1건 → 옛 수집기 행 모양. 상대는 participants 중 우리 선수(새 id)가 아닌 쪽,
// 승패는 우리 쪽 participant.result다. 모양이 예상과 다르면 null(호출자가 unknown으로 센다).
function toMatchRow(m, v2Id) {
  const parts = Array.isArray(m && m.participants) ? m.participants : [];
  const me = parts.find((p) => Number(p && p.player_id) === Number(v2Id));
  const opp = parts.find((p) => Number(p && p.player_id) !== Number(v2Id));
  const result = String((me && me.result) || "");
  if (!me || !opp || (result !== "win" && result !== "loss")) return null;
  const race = String(opp.race || "").trim();
  return {
    date: String(m.played_on || "").slice(0, 10),
    // 옛 표기 "라히(T)" 그대로 — export-player-matches-csv가 괄호로 이름/종족을 가른다.
    opponent: race ? `${String(opp.name || "").trim()}(${race})` : String(opp.name || "").trim(),
    map: String(m.map_name || m.map_raw || "").trim(),
    // 옛 결과 칸은 ELO 증감("+10.5")이었다. 새 API는 elo_delta가 비어 있는 경기가 많다(빈 문자열).
    result_text: formatEloDelta(m.elo_delta, result === "win"),
    // 옛 "경기방식" 칸(단판·3/2(1) 등) = format_raw.
    set_score: String(m.format_raw || "").trim(),
    note: buildNote(m),
    is_win: result === "win",
    division: String(m.division || ""),
    source_match_id: Number(m.id),
  };
}

function isSelfMatch(m) {
  const ids = (Array.isArray(m && m.participants) ? m.participants : []).map((p) => Number(p && p.player_id));
  return ids.length >= 2 && ids.every((id) => id === ids[0]);
}

// 선수 목록이 "2025 이후 뛰었다"(last_played_on)고 하는데 0행이면 소스가 이상한 것이다.
// 0건을 그대로 쓰면 상위가 기존 파일을 빈 결과로 덮는다 → 쓰지 않고 실패로 끝낸다.
function isSourceAnomaly(lastPlayedOn, matchCount) {
  return String(lastPlayedOn || "") >= START_DATE && Number(matchCount) === 0;
}

function summarize(player, v2, rawMatches, pages) {
  const matches = [];
  const seen = new Set();
  let unknownOutcomeRows = 0;
  let selfMatchRows = 0;
  for (const m of rawMatches) {
    // 같은 경기가 페이지 경계에서 두 번 올 수 있다(수집 중 새 경기가 올라오면 offset이 밀린다).
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (!inRange(String(m.played_on || "").slice(0, 10))) continue;
    // 엘로보드 입력 오류: 참가자가 전부 같은 선수(자기 자신과 붙은 경기)인 행이 있다
    // (2026-09-25 실측 6명, 예: 졈니 vs 졈니 2025-08-27). 한 줄 때문에 선수 전체가 unknown
    // 판정으로 실패해 반영이 막혔다 → 원본 오류로 보고 건너뛰되 개수는 남긴다.
    if (isSelfMatch(m)) {
      selfMatchRows += 1;
      continue;
    }
    const row = toMatchRow(m, v2.id);
    if (!row) {
      unknownOutcomeRows += 1;
      continue;
    }
    matches.push(row);
  }
  const lastPlayedOn = v2.player ? v2.player.last_played_on : null;
  if (isSourceAnomaly(lastPlayedOn, matches.length)) {
    const error = new Error(
      `source_anomaly: ${player.name} v2_id=${v2.id} last_played_on=${lastPlayedOn} matches=0`
    );
    error.code = "SOURCE_ANOMALY";
    throw error;
  }
  const wins = matches.filter((m) => m.is_win).length;
  const losses = matches.length - wins;
  const dates = matches.map((m) => m.date).sort();
  const validation = {
    no_unknown_outcome: unknownOutcomeRows === 0,
    no_out_of_range: matches.every((m) => inRange(m.date)),
    wins_losses_match_total: wins + losses === matches.length,
    display_total_consistent: !isSourceAnomaly(lastPlayedOn, matches.length),
  };
  return {
    ...player,
    eloboard_v2_id: v2.id,
    eloboard_v2_resolved_via: v2.via,
    period_total: matches.length,
    period_wins: wins,
    period_losses: losses,
    period_win_rate: matches.length ? Number(((wins / matches.length) * 100).toFixed(2)) : 0,
    period_min_date: dates[0] || null,
    period_max_date: dates[dates.length - 1] || null,
    pages_scanned: pages,
    unknown_outcome_rows: unknownOutcomeRows,
    // 엘로보드 원본 오류(자기 자신과 붙은 경기)로 건너뛴 행 수. 0이 아니면 사이트 쪽 입력 실수다.
    self_match_rows: selfMatchRows,
    validation,
    validation_pass: Object.values(validation).every(Boolean),
    scan_strategy: "full_scan",
    matches: INCLUDE_MATCHES ? matches : undefined,
  };
}

async function collectPlayer(player, resolve) {
  const v2 = resolve(player.entity_id);
  if (!v2) {
    const error = new Error(`unmapped_v2: ${player.name} ${player.entity_id || "(no entity_id)"} has no eloboard v2 id`);
    error.code = "UNMAPPED_V2";
    throw error;
  }
  const { matches, pages } = await fetchPlayerMatchesSince(v2.id, START_DATE);
  return summarize(player, v2, matches, pages);
}

async function main() {
  const entityId = argValue("--entity-id");
  if (!entityId) {
    // 팀 전체 모드(옛 대학 게시판 명단 파싱)는 게시판과 함께 죽었다. 선수 단위로만 부른다.
    throw new Error("Missing required arg: --entity-id <eloboard:...> (single-player collection only)");
  }
  const player = {
    name: argValue("--player", entityId),
    tier: argValue("--tier"),
    wr_id: Number(argValue("--wr-id")) || null,
    gender: argValue("--gender"),
    entity_id: entityId,
  };

  let rec;
  try {
    rec = await collectPlayer(player, await loadV2Resolver());
    if (!JSON_ONLY) {
      console.log(
        `[OK] ${rec.name} v2=${rec.eloboard_v2_id} ${rec.period_total} (${rec.period_wins}/${rec.period_losses}) ${rec.period_min_date || "-"}~${rec.period_max_date || "-"} validation=${rec.validation_pass ? "PASS" : "FAIL"}`
      );
    }
  } catch (error) {
    const code = error && error.code ? String(error.code) : "";
    // 소스 장애는 stderr에도 남긴다. 상위(export)가 자식 실패 메시지에서 이 마커로
    // "사이트가 죽었다"를 식별해 회로 차단기를 돌린다(--json-only여도 stdout은 오염되지 않는다).
    console.error(`[${code === "SOURCE_OUTAGE" || code === "SOURCE_ANOMALY" ? "SOURCE" : "FAIL"}] ${player.name} ${error.message}`);
    rec = { ...player, error: error.message, ...(code ? { error_code: code } : {}) };
  }
  if (!INCLUDE_MATCHES) delete rec.matches;

  const generatedAt = new Date().toISOString();
  console.log(
    JSON.stringify(
      {
        generated_at: generatedAt,
        team_name: argValue("--univ"),
        source: "eloboard_v2_api",
        period: { from: START_DATE, to: END_DATE },
        count: 1,
        validation_failed_count: rec.validation_pass === false ? 1 : 0,
        players: [rec],
      },
      null,
      2
    )
  );

  // 실패는 종료코드로 알린다. 0으로 끝나면 상위가 오류 레코드를 "경기 없는 정상 결과"로 알고
  // 멀쩡한 기존 json을 덮어쓴다.
  if (rec.error || rec.validation_pass === false) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  START_DATE,
  buildNote,
  toMatchRow,
  isSourceAnomaly,
  isSelfMatch,
  summarize,
  collectPlayer,
};
