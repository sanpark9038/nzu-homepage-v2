const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const ROOT = path.resolve(__dirname, "..", "..");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const euc = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEuc = (euc.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEuc ? utf8 : euc;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    timeout: 30000,
  });
  return decodeHtml(res.data);
}

function normalizeRace(r) {
  const s = String(r || "").trim().toLowerCase();
  if (s === "z" || s.includes("zerg")) return "Zerg";
  if (s === "p" || s.includes("protoss")) return "Protoss";
  if (s === "t" || s.includes("terran")) return "Terran";
  return "Unknown";
}

function slugifyTier(tier) {
  const raw = String(tier || "").trim();
  const map = {
    갓: "god",
    킹: "king",
    잭: "jack",
    조커: "joker",
    스페이드: "spade",
    유스: "baby",
    베이비: "baby",
    미정: "unknown",
  };
  if (raw === "9") return "baby";
  if (map[raw]) return map[raw];
  if (/^\d+$/.test(raw)) return raw;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function slugifyRace(race) {
  const r = String(race || "").toLowerCase();
  if (r.includes("zerg")) return "zerg";
  if (r.includes("protoss")) return "protoss";
  if (r.includes("terran")) return "terran";
  return "unknown";
}

function slug(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table.table tbody tr").each((_, tr) => {
    const row = $(tr);
    const pName = row.find("a.p_name").first();
    if (!pName.length) return;
    const full = pName.text().trim();
    const name = full.replace(/\([^)]*\)\s*$/, "").trim();
    const tierMatch = full.match(/\(([^)]+)\)\s*$/);
    const tier = tierMatch ? tierMatch[1].trim() : "미정";

    const tds = row.find("td");
    const raceCell = $(tds[1]).text().trim();
    const raceMatch = raceCell.match(/(Zerg|Protoss|Terran|Z|P|T)/i);
    const race = normalizeRace(raceMatch ? raceMatch[1] : "Unknown");

    const historyHref = row.find('a[target="_blank"]').attr("href") || "";
    if (!historyHref) return;
    const profileUrl = historyHref.startsWith("http")
      ? historyHref
      : `https://eloboard.com${historyHref}`;
    const wr = profileUrl.match(/wr_id=(\d+)/);
    const wrId = wr ? Number(wr[1]) : null;
    if (!wrId) return;
    rows.push({ wr_id: wrId, name, tier, race });
  });

  const byWr = new Map();
  for (const r of rows) {
    if (!byWr.has(r.wr_id)) byWr.set(r.wr_id, r);
  }
  return byWr;
}

function ensureMetaTags(player, teamCode, teamKo, teamEnTag) {
  const tags = new Set(Array.isArray(player.meta_tags) ? player.meta_tags : []);
  tags.add("domain:player");
  tags.add(`team:${teamCode}`);
  tags.add(`team_code:${teamCode}`);
  tags.add(`team_ko:${teamKo}`);
  tags.add(`team_en:${teamEnTag}`);
  tags.delete(`team_en:${teamCode}`);
  if (player.gender) tags.add(`gender:${player.gender}`);
  tags.add(`race:${slugifyRace(player.race)}`);
  tags.add(`tier:${slugifyTier(player.tier)}`);
  player.meta_tags = [...tags];
}

async function main() {
  const project = argValue("--project");
  const team = argValue("--team");
  if (!project || !team) {
    throw new Error("Usage: node scripts/tools/enrich-team-metadata.js --project <code> --team <한글팀명>");
  }

  const filePath = path.join(ROOT, "data", "metadata", "projects", project, `players.${project}.v1.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Missing metadata file: ${filePath}`);
  const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(json.roster)) throw new Error("Invalid project metadata: roster is not an array");

  const teamCode = String(json.team_code || project).toLowerCase();
  const teamKo = String(json.team_name || team);
  const teamEnTag = slug(String(json.team_name_en || teamCode)) || teamCode;
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(team)}`;
  const html = await fetchHtml(url);
  const byWr = parseRoster(html);

  let enriched = 0;
  let unchanged = 0;
  let notFound = 0;
  const details = [];

  for (const p of json.roster) {
    const hit = byWr.get(Number(p.wr_id));
    if (!hit) {
      notFound += 1;
      ensureMetaTags(p, teamCode, teamKo, teamEnTag);
      details.push({ wr_id: p.wr_id, name: p.name, status: "not_found" });
      continue;
    }
    const nextTier = hit.tier || p.tier || "미정";
    const nextRace = hit.race || p.race || "Unknown";
    const changed = nextTier !== p.tier || nextRace !== p.race;
    p.tier = nextTier;
    p.race = nextRace;
    ensureMetaTags(p, teamCode, teamKo, teamEnTag);
    if (changed) enriched += 1;
    else unchanged += 1;
    details.push({ wr_id: p.wr_id, name: p.name, tier: p.tier, race: p.race, status: changed ? "enriched" : "unchanged" });
  }

  json.generated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf8");

  const reportPath = path.join(ROOT, "tmp", "reports", `${project}_metadata_enrichment_report.json`);
  const report = {
    generated_at: new Date().toISOString(),
    source_url: url,
    team: teamKo,
    team_code: teamCode,
    roster_count: json.roster.length,
    roster_parsed_count: byWr.size,
    enriched_count: enriched,
    unchanged_count: unchanged,
    not_found_count: notFound,
    output: filePath,
    details,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
