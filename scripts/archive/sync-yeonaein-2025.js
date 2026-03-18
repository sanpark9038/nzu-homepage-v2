const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PLAYER_NAME = "연애인";
const WR_ID = "373";
const GENDER = "female";
const START_DATE = "2025-01-01";
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const PROFILE_URL = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${WR_ID}`;
const EXCLUDED_OPPONENTS = new Set(["엘사", "시조새"]);

function normalizeDate(dateText) {
  const raw = dateText.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}-\d{2}-\d{2}$/.test(raw)) return `20${raw}`;
  return null;
}

function parseOutcome(resultText, dateCellStyle, rowText) {
  const rt = (resultText || "").replace(/\s+/g, "");
  const full = rowText.replace(/\s+/g, "");

  if (rt.includes("+")) return true;
  if (rt.includes("-")) return false;
  if (rt.includes("승") || full.includes("승")) return true;
  if (rt.includes("패") || full.includes("패")) return false;

  const style = (dateCellStyle || "").toLowerCase();
  if (style.includes("#0cf") || style.includes("#00ccff")) return true;
  if (style.includes("#434348")) return false;

  return null;
}

function parseOpponent(opponentRaw) {
  const raceMatch = opponentRaw.match(/\(([PTZR])\)/i);
  const opponent_race = raceMatch ? raceMatch[1].toUpperCase() : "U";
  const opponent_name = opponentRaw.replace(/\(.*?\)/g, "").trim();
  return { opponent_name, opponent_race };
}

async function fetchProfileHtml() {
  const response = await axios.get(PROFILE_URL, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  let html = iconv.decode(response.data, "utf8");
  const contentType = (response.headers["content-type"] || "").toLowerCase();
  if (
    contentType.includes("euc-kr") ||
    contentType.includes("cp949") ||
    html.includes("charset=euc-kr") ||
    html.includes("charset=cp949")
  ) {
    html = iconv.decode(response.data, "cp949");
  }

  return html;
}

function parseMatches(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const dateRaw = cells.eq(0).text().trim();
    const match_date = normalizeDate(dateRaw);
    if (!match_date) return;
    if (match_date < START_DATE || match_date > TODAY) return;

    const rowText = $(row).text().replace(/\s+/g, " ");
    if (rowText.includes("혼성밀리")) return;

    const col1 = cells.eq(1).text().trim();
    const col2 = cells.eq(2).text().trim();
    const col3 = cells.eq(3).text().trim();

    let opponentRaw;
    let map;
    let result_text;

    if (col1.includes("(")) {
      opponentRaw = col1;
      map = col2;
      result_text = col3;
    } else {
      result_text = col1;
      map = col2;
      opponentRaw = col3;
    }

    const { opponent_name, opponent_race } = parseOpponent(opponentRaw);
    if (!opponent_name) return;
    if (EXCLUDED_OPPONENTS.has(opponent_name)) return;

    const turn = cells.eq(4).text().trim();
    const memo = cells.length > 5 ? cells.eq(5).text().trim() : "";
    const note = `[${turn}] ${memo}`.trim();
    const is_win = parseOutcome(result_text, cells.eq(0).attr("style") || "", rowText);

    rows.push({
      id: randomUUID(),
      player_name: PLAYER_NAME,
      gender: GENDER,
      match_date,
      opponent_name,
      opponent_race,
      map,
      result_text: result_text || "",
      is_win,
      note,
      created_at: new Date().toISOString(),
    });
  });

  return rows;
}

async function insertInChunks(records, chunkSize = 500) {
  let inserted = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from("eloboard_matches").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}

async function run() {
  console.log(`Sync target: ${PLAYER_NAME} (wr_id=${WR_ID})`);
  console.log(`Range: ${START_DATE} ~ ${TODAY}`);
  console.log(`Source: ${PROFILE_URL}`);

  const html = await fetchProfileHtml();
  const parsed = parseMatches(html);

  console.log(`Parsed rows (no dedupe): ${parsed.length}`);

  const { error: delErr } = await supabase
    .from("eloboard_matches")
    .delete()
    .eq("player_name", PLAYER_NAME)
    .gte("match_date", START_DATE)
    .lte("match_date", TODAY);
  if (delErr) throw delErr;

  const inserted = await insertInChunks(parsed);
  console.log(`Inserted rows: ${inserted}`);

  const { count, error: countErr } = await supabase
    .from("eloboard_matches")
    .select("*", { count: "exact", head: true })
    .eq("player_name", PLAYER_NAME)
    .gte("match_date", START_DATE)
    .lte("match_date", TODAY);
  if (countErr) throw countErr;

  console.log(`DB count after sync: ${count}`);
}

run().catch((err) => {
  console.error("sync-yeonaein-2025 failed:", err.message);
  process.exit(1);
});
