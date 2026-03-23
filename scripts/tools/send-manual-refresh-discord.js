const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const TMP_DIR = path.join(ROOT, "tmp");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function latestFileByPrefix(prefix) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((name) => {
      const full = path.join(REPORTS_DIR, name);
      return { full, name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function sumBy(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row && row[key] ? row[key] : 0) || 0), 0);
}

function normalizeTeamName(value) {
  const raw = String(value || "").trim();
  return raw || "무소속";
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function loadCurrentRosterState() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const teamDirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  const players = [];
  for (const code of teamDirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJsonIfExists(filePath);
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const player of roster) {
      players.push({
        entity_id: String(player && player.entity_id ? player.entity_id : ""),
        name: String(player && player.name ? player.name : ""),
        display_name: String(
          player && (player.display_name || player.name) ? player.display_name || player.name : ""
        ),
        team_code: String(player && player.team_code ? player.team_code : doc.team_code || code),
        team_name: normalizeTeamName(player && player.team_name ? player.team_name : doc.team_name || code),
        tier: String(player && player.tier ? player.tier : ""),
        last_changed_at: player && player.last_changed_at ? player.last_changed_at : null,
      });
    }
  }
  return players;
}

function buildPlayerKey(player) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  if (entityId) return `entity:${entityId}`;
  return `name:${String(player && player.name ? player.name : "").trim().toLowerCase()}`;
}

function toPlayerMap(players) {
  return new Map(players.map((player) => [buildPlayerKey(player), player]));
}

function loadBaselinePlayers() {
  const baseline = readJsonIfExists(BASELINE_PATH);
  const teams = Array.isArray(baseline && baseline.teams) ? baseline.teams : [];
  return teams.flatMap((team) => (Array.isArray(team.players) ? team.players : []));
}

function comparePlayerChanges(beforePlayers, afterPlayers) {
  const beforeMap = toPlayerMap(beforePlayers);
  const afterMap = toPlayerMap(afterPlayers);
  const tierChanges = [];
  const affiliationChanges = [];
  const joiners = [];
  const removals = [];

  for (const [key, current] of afterMap.entries()) {
    const prev = beforeMap.get(key);
    if (!prev) {
      joiners.push({
        player_name: current.display_name || current.name,
        team_name: normalizeTeamName(current.team_name),
      });
      continue;
    }

    const prevTier = String(prev.tier || "").trim();
    const currentTier = String(current.tier || "").trim();
    if (prevTier && currentTier && prevTier !== currentTier) {
      tierChanges.push({
        player_name: current.display_name || current.name,
        team_name: normalizeTeamName(current.team_name),
        old_tier: prevTier,
        new_tier: currentTier,
      });
    }

    const prevTeam = normalizeTeamName(prev.team_name);
    const currentTeam = normalizeTeamName(current.team_name);
    if (prevTeam !== currentTeam) {
      affiliationChanges.push({
        player_name: current.display_name || current.name,
        old_team: prevTeam,
        new_team: currentTeam,
      });
    }
  }

  for (const [key, prev] of beforeMap.entries()) {
    if (afterMap.has(key)) continue;
    removals.push({
      player_name: prev.display_name || prev.name,
      team_name: normalizeTeamName(prev.team_name),
    });
  }

  tierChanges.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  affiliationChanges.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  joiners.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  removals.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));

  return { tierChanges, affiliationChanges, joiners, removals };
}

function matchFilePathForPlayer(player) {
  const teamName = String(player && player.team_name ? player.team_name : "").trim();
  const playerName = String(player && player.name ? player.name : "").trim();
  if (!teamName || !playerName) return null;
  return path.join(TMP_DIR, `${teamName}_${playerName}_matches.json`);
}

function countTodayMatchesForPlayer(player, targetDate) {
  const filePath = matchFilePathForPlayer(player);
  if (!filePath || !fs.existsSync(filePath)) return 0;
  const doc = readJsonIfExists(filePath);
  const rows =
    Array.isArray(doc && doc.players) && doc.players[0] && Array.isArray(doc.players[0].matches)
      ? doc.players[0].matches
      : [];
  return rows.reduce((acc, row) => {
    return String(row && row.date ? row.date : "").trim() === targetDate ? acc + 1 : acc;
  }, 0);
}

function buildTodayTopPlayers(afterPlayers) {
  const targetDate = todayInSeoul();
  const rows = afterPlayers
    .map((player) => ({
      player_name: player.display_name || player.name,
      team_name: normalizeTeamName(player.team_name),
      today_matches: countTodayMatchesForPlayer(player, targetDate),
    }))
    .filter((row) => row.today_matches > 0)
    .sort((a, b) => {
      if (a.today_matches !== b.today_matches) return b.today_matches - a.today_matches;
      return String(a.player_name).localeCompare(String(b.player_name), "ko");
    });

  return {
    targetDate,
    players: rows.slice(0, 5),
  };
}

function dateLabelFromSnapshot(snapshot) {
  const generatedAt = String(snapshot && snapshot.generated_at ? snapshot.generated_at : "").trim();
  if (generatedAt) {
    const dt = new Date(generatedAt);
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
    }
  }
  const dateTag = String(snapshot && snapshot.period_to ? snapshot.period_to : "").trim();
  if (dateTag) return dateTag;
  return new Date().toISOString().slice(0, 10);
}

function buildSuccessMessage({ snapshot, alertsDoc, runUrl }) {
  const beforePlayers = loadBaselinePlayers();
  const afterPlayers = loadCurrentRosterState();
  const { tierChanges, affiliationChanges, joiners, removals } = comparePlayerChanges(beforePlayers, afterPlayers);
  const todayTop = buildTodayTopPlayers(afterPlayers);
  const teams = Array.isArray(snapshot && snapshot.teams) ? snapshot.teams : [];
  const alerts = Array.isArray(alertsDoc && alertsDoc.alerts) ? alertsDoc.alerts : [];
  const newMatches = teams.reduce((acc, row) => {
    const value = Number(row && row.delta_total_matches);
    if (!Number.isFinite(value) || value <= 0) return acc;
    return acc + value;
  }, 0);

  const lines = [`NZU 일일 업데이트 (${dateLabelFromSnapshot(snapshot)})`, ""];

  if (
    !tierChanges.length &&
    !affiliationChanges.length &&
    !joiners.length &&
    !removals.length &&
    newMatches <= 0 &&
    !todayTop.players.length
  ) {
    lines.push("오늘 변동사항 없음");
  } else {
    if (tierChanges.length) {
      lines.push("📊 티어 변동");
      for (const item of tierChanges) {
        lines.push(`- ${item.player_name} (${item.team_name}) : ${item.old_tier} -> ${item.new_tier}`);
      }
      lines.push("");
    }

    if (affiliationChanges.length) {
      lines.push("🏠 소속 변동");
      for (const item of affiliationChanges) {
        lines.push(`- ${item.player_name} : ${item.old_team} -> ${item.new_team}`);
      }
      lines.push("");
    }

    if (joiners.length) {
      lines.push("🆕 신규 합류");
      for (const item of joiners) {
        lines.push(`- ${item.player_name} (${item.team_name})`);
      }
      lines.push("");
    }

    if (removals.length) {
      lines.push("📤 로스터 제외");
      for (const item of removals) {
        lines.push(`- ${item.player_name} (${item.team_name})`);
      }
      lines.push("");
    }

    lines.push("🆕 신규 전적");
    lines.push(`- 직전 실행 대비 새로 반영된 경기: ${newMatches}건`);

    if (todayTop.players.length) {
      lines.push("");
      lines.push(`🔥 오늘 경기 수 상위 선수 (${todayTop.targetDate})`);
      for (const item of todayTop.players) {
        lines.push(`- ${item.player_name} (${item.team_name}) : ${item.today_matches}경기`);
      }
    }
  }

  if (alerts.length) {
    lines.push("");
    lines.push(`주의 알림: ${alerts.length}건`);
  }
  if (runUrl) {
    lines.push("");
    lines.push(`실행 링크: ${runUrl}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildFailureMessage({ snapshot, runUrl }) {
  const dateLabel = dateLabelFromSnapshot(snapshot);
  const lines = [
    `NZU 일일 업데이트 실패 (${dateLabel})`,
    "",
    "수집 또는 반영 단계에서 오류가 발생했습니다.",
  ];
  if (runUrl) {
    lines.push("");
    lines.push(`실행 링크: ${runUrl}`);
  }
  return lines.join("\n");
}

function buildMessage({ outcome, source, runUrl }) {
  const snapshotPath = latestFileByPrefix("daily_pipeline_snapshot_");
  const alertsPath = latestFileByPrefix("daily_pipeline_alerts_");
  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  if (outcome !== "success") {
    return buildFailureMessage({ snapshot, runUrl, source });
  }
  return buildSuccessMessage({ snapshot, alertsDoc, runUrl, source });
}

async function postDiscordWebhook(content) {
  const webhook =
    process.env.OPS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    "";
  if (!String(webhook).trim()) {
    console.log("Discord 웹훅이 없어 알림을 건너뜁니다.");
    return;
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord 웹훅 전송 실패: ${res.status} ${body}`);
  }
}

async function main() {
  const outcome = String(argValue("--outcome", "success")).trim().toLowerCase();
  const source = String(argValue("--source", "manual-refresh")).trim();
  const runUrl = String(argValue("--run-url", "")).trim();
  const noSend = hasFlag("--no-send");
  const message = buildMessage({ outcome, source, runUrl });
  if (!noSend) {
    await postDiscordWebhook(message);
  }
  console.log(message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
