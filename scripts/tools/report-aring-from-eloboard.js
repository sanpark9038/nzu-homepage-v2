const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const PLAYER_NAME = "아링";
const START_DATE = "2025-01-01";
const END_DATE = "2026-03-19";

const EXCLUDE_KEYWORDS = [
  "혼성",
  "남성",
  "남비",
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
};

function normalizeDate(text) {
  if (!text) return null;
  const t = text.trim();

  // yy-mm-dd
  const yy = t.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (yy) return `20${yy[1]}-${yy[2]}-${yy[3]}`;

  // yyyy-mm-dd
  const yyyy = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyy) return `${yyyy[1]}-${yyyy[2]}-${yyyy[3]}`;

  return null;
}

function parseOutcome(resultText, dateCellStyle, rowText) {
  const rt = (resultText || "").replace(/\s+/g, "");
  const full = (rowText || "").replace(/\s+/g, "");
  const style = (dateCellStyle || "").toLowerCase();

  if (rt.includes("승") || full.includes("승")) return true;
  if (rt.includes("패") || full.includes("패")) return false;
  if (rt.startsWith("+")) return true;
  if (rt.startsWith("-")) return false;

  if (style.includes("#00ccff")) return true;
  if (style.includes("#434348")) return false;

  return null;
}

function shouldExclude(rowText) {
  return EXCLUDE_KEYWORDS.some((k) => rowText.includes(k));
}

async function fetchPage(lastId) {
  const body = new URLSearchParams({
    p_name: PLAYER_NAME,
    last_id: String(lastId),
    b_id: "eloboard",
  }).toString();

  const res = await axios.post("https://eloboard.com/women/bbs/view_list.php", body, {
    headers: HEADERS,
    responseType: "arraybuffer",
    timeout: 20000,
  });

  // 서버 인코딩 편차 대응
  const htmlUtf8 = Buffer.from(res.data).toString("utf8");
  const htmlEucKr = iconv.decode(Buffer.from(res.data), "euc-kr");

  // 한글 깨짐이 적은 쪽 선택
  const pick = htmlUtf8.includes("tr") ? htmlUtf8 : htmlEucKr;
  return pick;
}

async function main() {
  let page = 0;
  let lastId = 0;
  let totalRows = 0;
  let scannedRows = 0;
  let excludedRows = 0;
  let unknownOutcomeRows = 0;

  const matches = [];
  const seen = new Set();
  let reachedOlderThanStart = false;

  while (page < 120 && !reachedOlderThanStart) {
    const html = await fetchPage(lastId);
    const $ = cheerio.load(html);
    const rows = $("tr");
    if (!rows.length) break;

    let pageParsed = 0;
    let pageMinDate = null;

    rows.each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 4) return;

      const dateRaw = $(cells[0]).text().trim();
      const matchDate = normalizeDate(dateRaw);
      if (!matchDate) return;

      totalRows += 1;
      pageParsed += 1;
      if (!pageMinDate || matchDate < pageMinDate) pageMinDate = matchDate;

      if (matchDate < START_DATE || matchDate > END_DATE) return;
      scannedRows += 1;

      const rowText = $(tr).text();
      if (shouldExclude(rowText)) {
        excludedRows += 1;
        return;
      }

      const resultText = $(cells[3]).text().trim();
      const dateCellStyle = $(cells[0]).attr("style") || "";
      const isWin = parseOutcome(resultText, dateCellStyle, rowText);

      if (isWin === null) {
        unknownOutcomeRows += 1;
        return;
      }

      const opponent = $(cells[1]).text().trim();
      const map = $(cells[2]).text().trim();
      const note = $(cells[5]).text().trim();

      const key = `${matchDate}|${opponent}|${map}|${resultText}|${note}`;
      if (seen.has(key)) return;
      seen.add(key);

      matches.push({
        match_date: matchDate,
        opponent,
        map,
        result_text: resultText,
        is_win: isWin,
        note,
      });
    });

    const lastIdInput = $('input[name="last_id"]').val();
    const parsedLastId = Number(lastIdInput || 0);
    if (!Number.isFinite(parsedLastId) || parsedLastId === lastId) break;
    lastId = parsedLastId;

    if (pageMinDate && pageMinDate < START_DATE) reachedOlderThanStart = true;
    if (pageParsed === 0) break;
    page += 1;
  }

  const wins = matches.filter((m) => m.is_win).length;
  const losses = matches.filter((m) => !m.is_win).length;
  const total = wins + losses;
  const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(2)) : 0;

  console.log(
    JSON.stringify(
      {
        player_name: PLAYER_NAME,
        source: "https://eloboard.com/women/bbs/view_list.php",
        period: { from: START_DATE, to: END_DATE },
        pages_scanned: page + 1,
        total_rows_seen: totalRows,
        rows_in_period: scannedRows,
        excluded_rows: excludedRows,
        unknown_outcome_rows: unknownOutcomeRows,
        counted_matches: total,
        wins,
        losses,
        win_rate_percent: winRate,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("report-aring-from-eloboard failed:", err.message);
  process.exit(1);
});
