const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const START_DATE = "2025-01-01";
const END_DATE = "2026-03-19";
const URL = "https://eloboard.com/women/bbs/view_list.php";

function normalizeDate(text) {
  if (!text) return null;
  const t = String(text).trim();
  const yy = t.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (yy) return `20${yy[1]}-${yy[2]}-${yy[3]}`;
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

async function fetchRows(pName, requestEncoding, bId) {
  const payloadObj = { p_name: pName, last_id: 0, b_id: bId };
  const payloadText = qs.stringify(payloadObj);

  let data = payloadText;
  let contentType = "application/x-www-form-urlencoded; charset=UTF-8";
  if (requestEncoding === "euc-kr") {
    data = iconv.encode(payloadText, "euc-kr");
    contentType = "application/x-www-form-urlencoded; charset=EUC-KR";
  }

  const res = await axios.post(URL, data, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": contentType,
    },
    responseType: "arraybuffer",
    timeout: 20000,
  });

  const buf = Buffer.from(res.data);
  const htmlUtf8 = buf.toString("utf8");
  const htmlEuc = iconv.decode(buf, "euc-kr");
  const html = htmlUtf8.includes("<tr") ? htmlUtf8 : htmlEuc;
  const $ = cheerio.load(html);

  const rows = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const dateRaw = $(cells[0]).text().trim();
    const date = normalizeDate(dateRaw);
    if (!date) return;
    const resultText = $(cells[3]).text().trim();
    const isWin = parseOutcome(resultText, $(cells[0]).attr("style") || "", $(tr).text());
    rows.push({
      date,
      is_win: isWin,
      opponent: $(cells[1]).text().trim(),
      map: $(cells[2]).text().trim(),
      result_text: resultText,
      note: $(cells[5]).text().trim(),
    });
  });

  return rows;
}

async function main() {
  const candidates = ["아링", "�븘留�"];
  const encodings = ["utf-8", "euc-kr"];
  const bIds = ["eloboard", "bj_list"];

  let best = { rows: [], info: null };

  for (const pName of candidates) {
    for (const enc of encodings) {
      for (const bId of bIds) {
        try {
          const rows = await fetchRows(pName, enc, bId);
          if (rows.length > best.rows.length) {
            best = { rows, info: { p_name: pName, request_encoding: enc, b_id: bId } };
          }
        } catch {
          // try next combo
        }
      }
    }
  }

  const inRange = best.rows.filter((r) => r.date >= START_DATE && r.date <= END_DATE);
  const valid = inRange.filter((r) => typeof r.is_win === "boolean");
  const wins = valid.filter((r) => r.is_win).length;
  const losses = valid.length - wins;
  const total = valid.length;
  const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(2)) : 0;

  console.log(
    JSON.stringify(
      {
        player_name: "아링",
        period: { from: START_DATE, to: END_DATE },
        source: URL,
        selected_combo: best.info,
        rows_fetched: best.rows.length,
        rows_in_period: inRange.length,
        unknown_outcome_rows: inRange.length - valid.length,
        wins,
        losses,
        win_rate_percent: winRate,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("report-aring-fast failed:", e.message);
  process.exit(1);
});
