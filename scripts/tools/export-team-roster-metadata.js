const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-records.js");

const argv = process.argv.slice(2);
const univArgIndex = argv.indexOf("--univ");
const TEAM_NAME =
  univArgIndex >= 0 && argv[univArgIndex + 1]
    ? argv[univArgIndex + 1]
    : "";
const TEAM_KEY = encodeURIComponent(TEAM_NAME).toLowerCase();
const allowEmpty = argv.includes("--allow-empty");
const maxAttemptsRaw = argv.includes("--max-attempts")
  ? Number(argv[argv.indexOf("--max-attempts") + 1] || 3)
  : 3;
const MAX_ATTEMPTS = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0 ? Math.floor(maxAttemptsRaw) : 3;

if (!TEAM_NAME) {
  throw new Error("Missing required arg: --univ <teamName>");
}

function makeTeamSlug(name) {
  const slug = String(name)
    .replace(/[^\w\uAC00-\uD7A3]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (slug) return slug;
  return encodeURIComponent(String(name)).toLowerCase();
}

const TEAM_SLUG = makeTeamSlug(TEAM_NAME);
const OUT_PATH = path.join(ROOT, "tmp", `${TEAM_SLUG}_roster_record_metadata.json`);

function buildPlayerId(p) {
  const gender = String(p.profile_url || "").includes("/men/") ? "male" : "female";
  return `${TEAM_KEY}:${gender}:${p.wr_id}`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fetchReportWithRetry() {
  let lastData = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = execFileSync("node", [REPORT_SCRIPT, "--json-only", "--univ", TEAM_NAME], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const data = JSON.parse(raw);
      lastData = data;
      const count = Number(data && data.count ? data.count : Array.isArray(data && data.players) ? data.players.length : 0);
      if (count > 0) return { data, attemptsUsed: attempt };
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) sleep(800 * attempt);
  }

  if (lastData) return { data: lastData, attemptsUsed: MAX_ATTEMPTS };
  throw lastErr || new Error("Failed to fetch roster report.");
}

function recoverZeroPlayerRows(data) {
  if (!data || !Array.isArray(data.players) || data.players.length === 0) {
    return { recoveredCount: 0, checkedCount: 0 };
  }

  let recoveredCount = 0;
  let checkedCount = 0;

  for (let i = 0; i < data.players.length; i += 1) {
    const p = data.players[i];
    const total = Number(p && p.period_total ? p.period_total : 0);
    if (total > 0) continue;
    if (!p || !p.name || !p.profile_url || !p.wr_id) continue;

    checkedCount += 1;
    const gender = String(p.profile_url).includes("/men/") ? "male" : "female";
    const tier = String(p.tier || "");

    try {
      const raw = execFileSync(
        "node",
        [
          REPORT_SCRIPT,
          "--json-only",
          "--no-cache",
          "--univ",
          TEAM_NAME,
          "--player",
          String(p.name),
          "--profile-url",
          String(p.profile_url),
          "--wr-id",
          String(p.wr_id),
          "--gender",
          gender,
          "--tier",
          tier,
          "--concurrency",
          "1",
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      const parsed = JSON.parse(raw);
      const next = Array.isArray(parsed.players) ? parsed.players[0] : null;
      const nextTotal = Number(next && next.period_total ? next.period_total : 0);
      if (next && nextTotal > 0) {
        data.players[i] = next;
        recoveredCount += 1;
      }
    } catch {
      // Keep original row when recovery fails.
    }
  }

  return { recoveredCount, checkedCount };
}

function main() {
  const { data, attemptsUsed } = fetchReportWithRetry();
  const recovery = recoverZeroPlayerRows(data);
  const generatedAt = new Date().toISOString();

  const players = (data.players || []).map((p) => {
    const total = Number(p.period_total || 0);
    const wins = Number(p.period_wins || 0);
    const losses = Number(p.period_losses || 0);
    const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(2)) : 0;
    const gender = String(p.profile_url || "").includes("/men/") ? "male" : "female";

    return {
      player_id: buildPlayerId(p),
      player_name_ko: p.name,
      team_name_ko: TEAM_NAME,
      gender,
      wr_id: p.wr_id,
      profile_url: p.profile_url,
      collection: {
        period_from: data.period.from,
        period_to: data.period.to,
        fetched_at: generatedAt,
        mode: p.mode,
        endpoint: p.endpoint,
        p_name: p.p_name,
      },
      record: {
        total,
        wins,
        losses,
        win_rate_percent: winRate,
        min_match_date: p.period_min_date,
        max_match_date: p.period_max_date,
      },
      validation: {
        pass: Boolean(p.validation_pass),
        unknown_outcome_rows: Number(p.unknown_outcome_rows || 0),
        no_unknown_outcome: Boolean(p.validation?.no_unknown_outcome),
        no_out_of_range: Boolean(p.validation?.no_out_of_range),
        wins_losses_match_total: Boolean(p.validation?.wins_losses_match_total),
      },
      meta_tags: [
        TEAM_SLUG,
        `team_key:${TEAM_KEY}`,
        `${TEAM_SLUG}-roster`,
        "record",
        "women-league",
        "eloboard",
        `season:${data.period.from}_to_${data.period.to}`,
        `team:${TEAM_NAME}`,
        `player:${p.name}`,
        `wr_id:${p.wr_id}`,
      ],
    };
  });

  const output = {
    schema_version: "1.0.0",
    dataset_id: `${TEAM_KEY}-roster-records-2025-current`,
    team_name_ko: TEAM_NAME,
    source: {
      provider: "eloboard",
      roster_url: data.roster_url,
    },
    period: data.period,
    generated_at: generatedAt,
    validation_failed_count: Number(data.validation_failed_count || 0),
    zero_row_recovery: recovery,
    total_players: players.length,
    players,
    meta_tags: [
      `dataset:${TEAM_KEY}-roster-records`,
      `team_key:${TEAM_KEY}`,
      `team:${TEAM_NAME}`,
      "type:competitive-record",
      "reuse:homepage",
      "reuse:multi-site",
    ],
  };

  if (!allowEmpty && players.length === 0) {
    if (fs.existsSync(OUT_PATH)) {
      const prev = JSON.parse(fs.readFileSync(OUT_PATH, "utf8").replace(/^\uFEFF/, ""));
      const prevCount = Number(prev && prev.total_players ? prev.total_players : 0);
      if (prevCount > 0) {
        throw new Error(
          `Refusing to overwrite non-empty roster with empty result for ${TEAM_NAME}. ` +
            `previous_total_players=${prevCount}, attempts=${attemptsUsed}. ` +
            `Use --allow-empty to bypass.`
        );
      }
    }
    throw new Error(
      `Empty roster detected for ${TEAM_NAME} after ${attemptsUsed} attempts. ` +
        `Write blocked by safety guard. Use --allow-empty to bypass.`
    );
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(OUT_PATH);
}

main();
