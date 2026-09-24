// 수집 경로 점검(아침 알림 "수집 경로 확인" 줄의 출처).
// 2026-09 개편으로 옛 게시판(팀 인덱스·로스터·프로필·view_list/연도 AJAX)은 전부 죽었다.
// 이제 수집기가 실제로 두드리는 새 JSON API 세 갈래만 본다 — 배경은 lib/eloboard-v2.js.
const fs = require("fs");
const path = require("path");
const { fetchJson, BASE_URL } = require("./lib/eloboard-v2");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const HEALTH_LATEST_JSON_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.json");
const HEALTH_LATEST_MD_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.md");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// 점검은 빨리 끝나야 한다 — 재시도 없이 한 번만 두드리고 실패를 그대로 기록한다.
async function runCheck(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, url: `${BASE_URL}${label}`, error: error instanceof Error ? error.message : String(error) };
  }
}

// 선수 목록: 수집기가 새 id를 해석하는 원천. soop_id 필드가 사라지면 식별 전체가 무너진다.
function evaluatePlayerList(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const withSoop = list.filter((p) => p && String(p.soop_id || "").trim()).length;
  return {
    ok: list.length > 0 && withSoop > 0 && list.every((p) => p && Number.isFinite(Number(p.id))),
    player_count: list.length,
    with_soop_id: withSoop,
  };
}

// 경기 목록: participants에 승패가 붙어 있어야 수집기가 행을 만든다.
function evaluateMatches(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const wellFormed = list.filter(
    (m) =>
      m &&
      m.played_on &&
      Array.isArray(m.participants) &&
      m.participants.some((p) => p && (p.result === "win" || p.result === "loss"))
  ).length;
  return {
    ok: list.length > 0 && wellFormed === list.length,
    row_count: list.length,
    latest_played_on: list[0] ? list[0].played_on : null,
  };
}

// 남자부·여자부 표본을 하나씩 — 부문별로 데이터가 따로 이관됐을 수 있다.
function pickSamplePlayers(players) {
  const list = Array.isArray(players) ? players : [];
  return ["men", "women"]
    .map((division) => list.find((p) => p && p.division === division && p.last_played_on))
    .filter(Boolean);
}

async function main() {
  const shouldWrite = hasFlag("--write");
  const markdownOnly = hasFlag("--markdown");

  const listPath = "/api/players?limit=200&offset=0";
  let players = [];
  const playerList = await runCheck(listPath, async () => {
    players = await fetchJson(listPath, { retries: 0 });
    return { url: `${BASE_URL}${listPath}`, ...evaluatePlayerList(players) };
  });

  const samples = pickSamplePlayers(players);
  const matchChecks = [];
  for (const sample of samples) {
    const matchesPath = `/api/matches?player_id=${sample.id}&limit=5&offset=0`;
    matchChecks.push(
      await runCheck(matchesPath, async () => ({
        url: `${BASE_URL}${matchesPath}`,
        division: sample.division,
        player: sample.name,
        ...evaluateMatches(await fetchJson(matchesPath, { retries: 0 })),
      }))
    );
  }
  const playerMatches = matchChecks.length
    ? { ok: matchChecks.every((c) => c.ok), url: matchChecks[0].url, samples: matchChecks }
    : { ok: false, reason: "no_sample_player" };

  const collegesPath = "/api/colleges";
  const colleges = await runCheck(collegesPath, async () => {
    const rows = await fetchJson(collegesPath, { retries: 0 });
    return { ok: Array.isArray(rows) && rows.length > 0, url: `${BASE_URL}${collegesPath}`, college_count: Array.isArray(rows) ? rows.length : 0 };
  });

  const summary = {
    generated_at: new Date().toISOString(),
    source: "eloboard_v2_api",
    checks: {
      player_list: playerList,
      player_matches: playerMatches,
      colleges,
    },
  };
  summary.ok = Object.values(summary.checks).every((check) => check.ok || check.skipped);

  if (shouldWrite) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(HEALTH_LATEST_JSON_PATH, JSON.stringify(summary, null, 2), "utf8");
    fs.writeFileSync(HEALTH_LATEST_MD_PATH, formatMarkdown(summary), "utf8");
  }

  console.log(markdownOnly ? formatMarkdown(summary) : JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

function checkStatusLabel(check) {
  if (check && check.skipped) return "skipped";
  return check && check.ok ? "ok" : "failed";
}

function formatMarkdown(summary) {
  const checks = summary && summary.checks ? summary.checks : {};
  const lines = [
    "## Collection Sources Health",
    "",
    `- Overall: ${summary && summary.ok ? "ok" : "failed"}`,
    `- Generated At: ${summary && summary.generated_at ? summary.generated_at : "-"}`,
    "",
    `- Player List: ${checkStatusLabel(checks.player_list)}`,
    `- Player Matches: ${checkStatusLabel(checks.player_matches)}`,
    `- Colleges: ${checkStatusLabel(checks.colleges)}`,
  ];
  if (checks.player_list && Number.isFinite(checks.player_list.player_count)) {
    lines.push(`- Players (first page): ${checks.player_list.player_count}`);
  }
  for (const sample of (checks.player_matches && checks.player_matches.samples) || []) {
    lines.push(`- Matches Sample (${sample.division || "-"} ${sample.player || "-"}): ${checkStatusLabel(sample)}${sample.latest_played_on ? ` latest=${sample.latest_played_on}` : ""}`);
  }
  for (const [id, check] of Object.entries(checks)) {
    if (check && check.error) lines.push(`- ${id} error: ${check.error}`);
  }
  return lines.join("\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  HEALTH_LATEST_JSON_PATH,
  HEALTH_LATEST_MD_PATH,
  evaluateMatches,
  evaluatePlayerList,
  formatMarkdown,
  pickSamplePlayers,
};
