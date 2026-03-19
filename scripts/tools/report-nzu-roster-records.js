const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const ROSTER_URL =
  "https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80";

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const euc = iconv.decode(Buffer.from(buffer), "euc-kr");
  // Prefer UTF-8 unless it clearly looks broken
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEuc = (euc.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEuc ? utf8 : euc;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    timeout: 20000,
  });
  return decodeHtml(res.data);
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  const players = [];

  $("table.table tbody tr").each((_, tr) => {
    const row = $(tr);
    const pName = row.find("a.p_name").first();
    if (!pName.length) return;

    const full = pName.text().trim(); // 예: 아링(8)
    const name = full.replace(/\([^)]*\)\s*$/, "").trim();
    const tierMatch = full.match(/\(([^)]+)\)\s*$/);
    const tier = tierMatch ? tierMatch[1].trim() : "";

    const tds = row.find("td");
    const raceCell = $(tds[1]).text().trim();
    const raceMatch = raceCell.match(/(Zerg|Protoss|Terran|Z|P|T)/i);
    const race = raceMatch ? raceMatch[1] : "";

    const historyHref = row.find('a[target="_blank"]').attr("href") || "";
    if (!historyHref) return;

    let profileUrl = historyHref.startsWith("http")
      ? historyHref
      : `https://eloboard.com${historyHref}`;
    profileUrl = profileUrl.replace(/^http:\/\//i, "https://");

    const wr = profileUrl.match(/wr_id=(\d+)/);
    const wr_id = wr ? Number(wr[1]) : null;

    players.push({
      name,
      tier,
      race,
      wr_id,
      profile_url: profileUrl,
    });
  });

  // wr_id 기준 중복 제거
  const dedup = new Map();
  for (const p of players) {
    const key = p.wr_id ?? `${p.name}|${p.profile_url}`;
    if (!dedup.has(key)) dedup.set(key, p);
  }
  return [...dedup.values()];
}

function parseProfileStats(html) {
  const total = html.match(
    /총전적\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/
  );
  const female = html.match(
    /여성\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/
  );
  const male = html.match(
    /남성\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/
  );

  const toObj = (m) =>
    m
      ? {
          total: Number(m[1].replace(/,/g, "")),
          wins: Number(m[2].replace(/,/g, "")),
          losses: Number(m[3].replace(/,/g, "")),
        }
      : null;

  let fallback = null;
  const any = html.match(/([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/);
  if (any) {
    fallback = {
      total: Number(any[1].replace(/,/g, "")),
      wins: Number(any[2].replace(/,/g, "")),
      losses: Number(any[3].replace(/,/g, "")),
    };
  }

  return {
    total: toObj(total),
    female: toObj(female),
    male: toObj(male),
    fallback,
  };
}

async function main() {
  const rosterHtml = await fetchHtml(ROSTER_URL);
  const roster = parseRoster(rosterHtml);

  const results = [];
  for (const p of roster) {
    try {
      const profileHtml = await fetchHtml(p.profile_url);
      const stats = parseProfileStats(profileHtml);
      results.push({ ...p, ...stats, error: null });
    } catch (e) {
      results.push({ ...p, total: null, female: null, male: null, error: e.message });
    }
  }

  const table = results.map((r) => ({
    name: r.name,
    wr_id: r.wr_id,
    race: r.race,
    tier: r.tier,
      total_record: r.total
        ? `${r.total.total}전 ${r.total.wins}승 ${r.total.losses}패`
        : r.fallback
        ? `${r.fallback.total}전 ${r.fallback.wins}승 ${r.fallback.losses}패`
        : "-",
    female_record: r.female
      ? `${r.female.total}전 ${r.female.wins}승 ${r.female.losses}패`
      : "-",
    profile: r.profile_url,
    error: r.error || "",
  }));

  console.log(JSON.stringify({ count: table.length, players: table }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
