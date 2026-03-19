const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-nzu-2025-records.js");

const argv = process.argv.slice(2);
const univArgIndex = argv.indexOf("--univ");
const TEAM_NAME =
  univArgIndex >= 0 && argv[univArgIndex + 1]
    ? argv[univArgIndex + 1]
    : "\uB2AA\uC9C0\uB300";
const TEAM_KEY = encodeURIComponent(TEAM_NAME).toLowerCase();

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

function main() {
  const raw = execFileSync("node", [REPORT_SCRIPT, "--json-only", "--univ", TEAM_NAME], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const data = JSON.parse(raw);
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

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(OUT_PATH);
}

main();
