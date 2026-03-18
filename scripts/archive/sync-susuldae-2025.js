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

const UNIVERSITY = "수술대";
const START_DATE = "2025-01-01";
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

// "연애인"에서 합의한 제외 규칙을 동일하게 적용
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

async function fetchProfileHtml(url) {
  const response = await axios.get(url, {
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

function parseMatchesForPlayer(html, playerName, gender) {
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
      player_name: playerName,
      gender,
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

async function syncPlayer(player) {
  const gender = player.gender === "male" ? "male" : "female";
  const subdomain = gender === "male" ? "men" : "women";
  const wrId = player.eloboard_id;
  const profileUrl = `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;

  const html = await fetchProfileHtml(profileUrl);
  const parsed = parseMatchesForPlayer(html, player.name, gender);

  const { error: delErr } = await supabase
    .from("eloboard_matches")
    .delete()
    .eq("player_name", player.name)
    .gte("match_date", START_DATE)
    .lte("match_date", TODAY);
  if (delErr) throw delErr;

  const inserted = await insertInChunks(parsed);
  return { inserted, parsedCount: parsed.length, profileUrl };
}

async function run() {
  console.log(`University: ${UNIVERSITY}`);
  console.log(`Range: ${START_DATE} ~ ${TODAY}`);
  console.log(`Rules: no-dedupe, exclude 혼성밀리, exclude opponents [${[...EXCLUDED_OPPONENTS].join(", ")}]`);

  const { data: players, error } = await supabase
    .from("players")
    .select("id,name,eloboard_id,gender,university")
    .eq("university", UNIVERSITY)
    .not("eloboard_id", "is", null)
    .order("name", { ascending: true });

  if (error) throw error;
  if (!players || players.length === 0) {
    console.log("No target players found.");
    return;
  }

  let totalInserted = 0;
  const summary = [];

  for (const player of players) {
    try {
      const result = await syncPlayer(player);
      totalInserted += result.inserted;
      summary.push({
        player: player.name,
        status: "ok",
        parsed: result.parsedCount,
        inserted: result.inserted,
      });
      console.log(`OK ${player.name}: parsed=${result.parsedCount}, inserted=${result.inserted}`);
    } catch (e) {
      summary.push({
        player: player.name,
        status: "error",
        error: e.message,
      });
      console.log(`ERR ${player.name}: ${e.message}`);
    }
  }

  const { count, error: countErr } = await supabase
    .from("eloboard_matches")
    .select("*", { count: "exact", head: true })
    .in("player_name", players.map((p) => p.name))
    .gte("match_date", START_DATE)
    .lte("match_date", TODAY);
  if (countErr) throw countErr;

  console.log("-----");
  console.log(`Players synced: ${players.length}`);
  console.log(`Total inserted this run: ${totalInserted}`);
  console.log(`DB count in range for these players: ${count}`);
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error("sync-susuldae-2025 failed:", err.message);
  process.exit(1);
});
