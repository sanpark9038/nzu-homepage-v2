const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

function usage() {
  console.log(
    "Usage: node scripts/tools/extract-roster-core.js --input <html> [--out-json <json>] [--out-tbody <html>]"
  );
}

function getArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

function normalizeRace(raw) {
  const text = String(raw || "").toLowerCase();
  if (text.includes("zerg")) return "Zerg";
  if (text.includes("protoss")) return "Protoss";
  if (text.includes("terran")) return "Terran";
  return "Unknown";
}

function parseNameTier(raw) {
  const m = String(raw || "").trim().match(/^(.+?)\((.+?)\)$/);
  if (!m) return { name: String(raw || "").trim(), tier: "미정" };
  return { name: m[1].trim(), tier: m[2].trim() };
}

function main() {
  const inputPath = getArg("--input");
  if (!inputPath) {
    usage();
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input file not found: ${resolvedInput}`);
  }

  const defaultBase = resolvedInput.replace(/\.[^.]+$/, "");
  const outJson = path.resolve(process.cwd(), getArg("--out-json") || `${defaultBase}.core.json`);
  const outTbody = path.resolve(process.cwd(), getArg("--out-tbody") || `${defaultBase}.tbody.html`);

  const html = fs.readFileSync(resolvedInput, "utf8");
  const $ = cheerio.load(html);

  const rows = [];
  $("table tbody tr").each((_, el) => {
    const row = $(el);
    const nameLink = row.find("a.p_name").first();
    if (!nameLink.length) return;

    const { name, tier } = parseNameTier(nameLink.text());
    const tds = row.find("td");
    const race = normalizeRace($(tds[1]).text());

    const historyLink = row.find('a[target="_blank"]').first().attr("href") || "";
    const wrMatch = historyLink.match(/wr_id=(\d+)/);
    const wr_id = wrMatch ? Number(wrMatch[1]) : null;
    const gender = historyLink.includes("/men/") ? "male" : "female";

    rows.push({
      name,
      tier,
      race,
      wr_id,
      gender,
      profile_url: historyLink || null,
    });
  });

  const tbodyHtml = $("table tbody").first().html() || "";
  fs.writeFileSync(outJson, JSON.stringify(rows, null, 2), "utf8");
  fs.writeFileSync(outTbody, `<tbody>\n${tbodyHtml}\n</tbody>\n`, "utf8");

  console.log(`input: ${resolvedInput}`);
  console.log(`rows: ${rows.length}`);
  console.log(`out-json: ${outJson}`);
  console.log(`out-tbody: ${outTbody}`);
}

main();
