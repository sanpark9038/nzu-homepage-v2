const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const PROFILE_URL =
  "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=953";
const ENDPOINT = "view_list.php";
const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);

const K_WIN = "\uC2B9";
const K_LOSS = "\uD328";
const FEMALE_MARKER = "\uC5EC\uC131\uBC00\uB9AC\uC804\uC801";

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const euc = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEuc = (euc.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEuc ? utf8 : euc;
}

function normalizeDate(text) {
  if (!text) return null;
  const t = String(text).trim();
  const yy = t.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (yy) return `20${yy[1]}-${yy[2]}-${yy[3]}`;
  const yyyy = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyy) return `${yyyy[1]}-${yyyy[2]}-${yyyy[3]}`;
  return null;
}

function parseOutcome(resultText, style0, rowText) {
  const rt = String(resultText || "").replace(/\s+/g, "");
  const full = String(rowText || "").replace(/\s+/g, "");
  const style = String(style0 || "").toLowerCase();
  if (rt.includes(K_WIN) || full.includes(K_WIN)) return true;
  if (rt.includes(K_LOSS) || full.includes(K_LOSS)) return false;
  if (rt.startsWith("+")) return true;
  if (rt.startsWith("-")) return false;
  if (style.includes("#00ccff") || style.includes("rgb(0,204,255)")) return true;
  if (style.includes("#434348") || style.includes("rgb(67,67,72)")) return false;
  return null;
}

function parseRowsFromBoard($, board) {
  const rows = [];
  board.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const date = normalizeDate($(cells[0]).text().trim());
    if (!date) return;
    rows.push({
      date,
      opponent: $(cells[1]).text().trim(),
      map: $(cells[2]).text().trim(),
      result_text: $(cells[3]).text().trim(),
      note: $(cells[5]).text().trim(),
      style0: $(cells[0]).attr("style") || "",
      row_text: $(tr).text(),
    });
  });
  return rows;
}

async function fetchProfile() {
  const res = await axios.get(PROFILE_URL, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000,
  });
  return decodeHtml(res.data);
}

function extractInitial(profileHtml) {
  const $ = cheerio.load(profileHtml);
  const marker = $("strong")
    .toArray()
    .find((el) => $(el).text().includes(FEMALE_MARKER));
  const board = marker ? $(marker).nextAll("div.list-board").first() : $("div.list-board").first();
  const rows = parseRowsFromBoard($, board);
  const more = board.nextAll("div.list-row").find("a.more[id]").first();
  const lastId = more.length ? Number(more.attr("id")) : 0;
  const endpointIdx = profileHtml.indexOf(ENDPOINT);
  const slice =
    endpointIdx >= 0
      ? profileHtml.slice(Math.max(0, endpointIdx - 3000), endpointIdx + 3000)
      : profileHtml;
  const pNameMatch = slice.match(/p_name\s*:\s*"([^"]+)"/);
  const pName = pNameMatch ? pNameMatch[1] : "\uC544\uB9C1";
  return { rows, lastId, pName };
}

async function fetchPageRows(lastId, pName) {
  const url = "https://eloboard.com/women/bbs/view_list.php";
  const body = qs.stringify({ p_name: pName, last_id: lastId });
  const res = await axios.post(url, body, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: PROFILE_URL,
    },
    timeout: 30000,
  });
  const html = decodeHtml(res.data);
  const $ = cheerio.load(html);
  const rows = parseRowsFromBoard($, $.root());
  const nextLastId = Number($('input[name="last_id"]').val() || 0);
  return { rows, nextLastId };
}

function keyForDedup(r) {
  return `${r.date}|${r.opponent}|${r.map}|${r.result_text}|${r.note}`;
}

async function main() {
  const profileHtml = await fetchProfile();
  const displayMatch = profileHtml.match(
    /\uC5EC\uC131\uC804\uC801\s*:\s*([0-9,]+)\uC804\s*([0-9,]+)\uC2B9\s*([0-9,]+)\uD328/
  );
  const display = displayMatch
    ? {
        total: Number(displayMatch[1].replace(/,/g, "")),
        wins: Number(displayMatch[2].replace(/,/g, "")),
        losses: Number(displayMatch[3].replace(/,/g, "")),
      }
    : null;

  const initial = extractInitial(profileHtml);
  const allRows = [...initial.rows];

  let lastId = initial.lastId;
  for (let i = 0; i < 40 && lastId > 0; i += 1) {
    const page = await fetchPageRows(lastId, initial.pName);
    if (!page.rows.length) break;
    allRows.push(...page.rows);
    if (!Number.isFinite(page.nextLastId) || page.nextLastId <= 0 || page.nextLastId === lastId) break;
    lastId = page.nextLastId;
  }

  const inPeriod = allRows.filter((r) => r.date >= START_DATE && r.date <= END_DATE);
  const outcomeKnown = inPeriod.filter((r) => parseOutcome(r.result_text, r.style0, r.row_text) !== null);
  const outcomeUnknown = inPeriod.filter((r) => parseOutcome(r.result_text, r.style0, r.row_text) === null);

  const dedupMap = new Map();
  const collisions = [];
  for (const r of outcomeKnown) {
    const key = keyForDedup(r);
    if (dedupMap.has(key)) {
      collisions.push({ key, prev: dedupMap.get(key), curr: r });
    } else {
      dedupMap.set(key, r);
    }
  }

  const uniqueRows = [...dedupMap.values()];
  const wins = uniqueRows.filter((r) => parseOutcome(r.result_text, r.style0, r.row_text)).length;
  const losses = uniqueRows.length - wins;

  console.log(
    JSON.stringify(
      {
        display_female: display,
        p_name: initial.pName,
        fetched_all_rows: allRows.length,
        in_period_rows: inPeriod.length,
        outcome_known_rows: outcomeKnown.length,
        outcome_unknown_rows: outcomeUnknown.length,
        dedup_unique_rows: uniqueRows.length,
        dedup_collisions: collisions.length,
        final_wins: wins,
        final_losses: losses,
        unknown_rows_sample: outcomeUnknown.slice(0, 5),
        collisions_sample: collisions.slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

