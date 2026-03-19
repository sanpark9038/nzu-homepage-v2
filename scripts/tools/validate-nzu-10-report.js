const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);

const OUT_JSON = path.join(process.cwd(), "tmp", "nzu_10_validation_report.json");
const OUT_MD = path.join(process.cwd(), "tmp", "nzu_10_validation_report.md");

// NZU roster sample (must be NZU members only)
const TARGETS = [
  { name: "쌍디", wr_id: 671, gender: "female" },
  { name: "애공", wr_id: 223, gender: "female" },
  { name: "슈슈", wr_id: 668, gender: "female" },
  { name: "연블비", wr_id: 627, gender: "female" },
  { name: "다라츄", wr_id: 927, gender: "female" },
  { name: "아링", wr_id: 953, gender: "female" },
  { name: "정연이", wr_id: 424, gender: "female" },
  { name: "지아송", wr_id: 981, gender: "female" },
  { name: "인치호", wr_id: 150, gender: "male" },
  { name: "김성제", wr_id: 207, gender: "male" },
];

const EXCLUDE_KEYWORDS = ["혼성", "남성", "남비", "남자", "혼성밀리"];

function boardBase(gender) {
  return gender === "male" ? "https://eloboard.com/men" : "https://eloboard.com/women";
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

function decodeHtml(buf) {
  const utf8 = Buffer.from(buf).toString("utf8");
  const euc = iconv.decode(Buffer.from(buf), "euc-kr");
  return utf8.includes("<html") ? utf8 : euc;
}

async function fetchProfileHtml(target) {
  const url = `${boardBase(target.gender)}/bbs/board.php?bo_table=bj_list&wr_id=${target.wr_id}`;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 20000,
  });
  return decodeHtml(res.data);
}

function extractProfileStats(profileHtml, target) {
  const titleMatch = profileHtml.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : null;

  const totalMatch = profileHtml.match(/총전적\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/);
  const femaleMatch = profileHtml.match(/여성\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/);
  const maleMatch = profileHtml.match(/남성\s*:\s*([0-9,]+)전\s*([0-9,]+)승\s*([0-9,]+)패/);
  const ownSection = target.gender === "male" ? maleMatch : femaleMatch;

  return {
    page_title: pageTitle,
    total_display: totalMatch
      ? { total: Number(totalMatch[1].replace(/,/g, "")), wins: Number(totalMatch[2].replace(/,/g, "")), losses: Number(totalMatch[3].replace(/,/g, "")) }
      : null,
    own_section_display: ownSection
      ? { total: Number(ownSection[1].replace(/,/g, "")), wins: Number(ownSection[2].replace(/,/g, "")), losses: Number(ownSection[3].replace(/,/g, "")) }
      : null,
  };
}

function extractPNameCandidates(profileHtml, fallbackName) {
  const out = new Set([fallbackName]);
  const patterns = [
    /p_name\s*[:=]\s*["']([^"']+)["']/gi,
    /name=["']p_name["'][^>]*value=["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m = null;
    while ((m = re.exec(profileHtml)) !== null) {
      if (m[1] && m[1].trim()) out.add(m[1].trim());
    }
  }
  return [...out];
}

async function fetchViewListRows(target, pName, lastId) {
  const url = `${boardBase(target.gender)}/bbs/view_list.php`;
  const body = qs.stringify({ p_name: pName, last_id: lastId });
  const res = await axios.post(url, body, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${boardBase(target.gender)}/bbs/board.php?bo_table=bj_list&wr_id=${target.wr_id}`,
    },
    timeout: 20000,
  });

  const html = decodeHtml(res.data);
  const $ = cheerio.load(html);
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const date = normalizeDate($(cells[0]).text().trim());
    if (!date) return;
    const rowText = $(tr).text();
    const resultText = $(cells[3]).text().trim();
    rows.push({
      date,
      opponent: $(cells[1]).text().trim(),
      map: $(cells[2]).text().trim(),
      result_text: resultText,
      style0: $(cells[0]).attr("style") || "",
      note: $(cells[5]).text().trim(),
      row_text: rowText,
    });
  });

  const hidden = $('input[name="last_id"]').val();
  const nextLastId = Number(hidden || 0);
  return { rows, nextLastId };
}

function extractInitialRowsFromProfile(profileHtml) {
  const $ = cheerio.load(profileHtml);
  const out = [];
  let initialLastId = 0;

  // 첫 번째 "밀리전적" 블록만 사용 (혼성 섹션 이전)
  const markers = $("strong").toArray();
  let targetMarker = null;
  for (const m of markers) {
    const txt = $(m).text().trim();
    if (txt.includes("밀리전적") && txt.includes("날짜 클릭")) {
      targetMarker = m;
      break;
    }
  }
  if (!targetMarker) return { rows: out, initialLastId };

  const board = $(targetMarker).nextAll("div.list-board").first();
  board.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const date = normalizeDate($(cells[0]).text().trim());
    if (!date) return;
    out.push({
      date,
      opponent: $(cells[1]).text().trim(),
      map: $(cells[2]).text().trim(),
      result_text: $(cells[3]).text().trim(),
      style0: $(cells[0]).attr("style") || "",
      note: $(cells[5]).text().trim(),
      row_text: $(tr).text(),
    });
  });

  const more = board.nextAll("div.list-row").find("a.more[id]").first();
  if (more.length) {
    const idVal = Number(more.attr("id"));
    if (Number.isFinite(idVal) && idVal > 0) initialLastId = idVal;
  }

  return { rows: out, initialLastId };
}

async function collectMatchesForTarget(target) {
  const profileHtml = await fetchProfileHtml(target);
  const profile = extractProfileStats(profileHtml, target);
  const pNameCandidates = extractPNameCandidates(profileHtml, target.name);
  const initial = extractInitialRowsFromProfile(profileHtml);

  let best = { matches: [], p_name: null, pages: 0 };

  for (const pName of pNameCandidates) {
    const seen = new Set();
    const collected = [];
    let pages = 0;

    for (const r of initial.rows) {
      if (r.date < START_DATE || r.date > END_DATE) continue;
      if (EXCLUDE_KEYWORDS.some((kw) => r.row_text.includes(kw) || r.note.includes(kw))) continue;
      const isWin = parseOutcome(r.result_text, r.style0, r.row_text);
      if (isWin === null) continue;
      const key = `${r.date}|${r.opponent}|${r.map}|${r.result_text}|${r.note}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push({
        match_date: r.date,
        opponent: r.opponent,
        map: r.map,
        result_text: r.result_text,
        is_win: isWin,
        note: r.note,
      });
    }

    let lastId = initial.initialLastId;
    if (!lastId) {
      if (collected.length > best.matches.length) {
        best = { matches: collected, p_name: pName, pages };
      }
      continue;
    }

    for (let i = 0; i < 80; i += 1) {
      const { rows, nextLastId } = await fetchViewListRows(target, pName, lastId);
      if (!rows.length) break;
      pages += 1;

      for (const r of rows) {
        if (r.date < START_DATE || r.date > END_DATE) continue;
        if (EXCLUDE_KEYWORDS.some((kw) => r.row_text.includes(kw) || r.note.includes(kw))) continue;

        const isWin = parseOutcome(r.result_text, r.style0, r.row_text);
        if (isWin === null) continue;

        const key = `${r.date}|${r.opponent}|${r.map}|${r.result_text}|${r.note}`;
        if (seen.has(key)) continue;
        seen.add(key);

        collected.push({
          match_date: r.date,
          opponent: r.opponent,
          map: r.map,
          result_text: r.result_text,
          is_win: isWin,
          note: r.note,
        });
      }

      if (!Number.isFinite(nextLastId) || nextLastId <= 0 || nextLastId === lastId) break;
      lastId = nextLastId;
    }

    if (collected.length > best.matches.length) {
      best = { matches: collected, p_name: pName, pages };
    }
  }

  const wins = best.matches.filter((m) => m.is_win).length;
  const losses = best.matches.filter((m) => !m.is_win).length;
  const total = wins + losses;
  const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(2)) : 0;

  return {
    name: target.name,
    wr_id: target.wr_id,
    gender: target.gender,
    p_name_used: best.p_name,
    pages_scanned: best.pages,
    wins,
    losses,
    total,
    win_rate_percent: winRate,
    profile_display: profile,
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# NZU 10명 검증 리포트`);
  lines.push(`- 기간: ${report.period.from} ~ ${report.period.to}`);
  lines.push(`- 생성시각: ${report.generated_at}`);
  lines.push("");
  lines.push("| 선수 | wr_id | 성별 | 승 | 패 | 승률 | p_name | 페이지 |");
  lines.push("|---|---:|---|---:|---:|---:|---|---:|");
  for (const r of report.players) {
    lines.push(
      `| ${r.name} | ${r.wr_id} | ${r.gender} | ${r.wins} | ${r.losses} | ${r.win_rate_percent}% | ${r.p_name_used || "-"} | ${r.pages_scanned} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const players = [];
  for (const t of TARGETS) {
    try {
      const row = await collectMatchesForTarget(t);
      players.push(row);
      console.log(`[OK] ${row.name} (${row.wr_id}) -> ${row.total}전 ${row.wins}승 ${row.losses}패 ${row.win_rate_percent}%`);
    } catch (e) {
      players.push({
        name: t.name,
        wr_id: t.wr_id,
        gender: t.gender,
        error: e.message,
      });
      console.log(`[FAIL] ${t.name} (${t.wr_id}) -> ${e.message}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    period: { from: START_DATE, to: END_DATE },
    scope: "NZU roster validation sample(10)",
    players,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, toMarkdown(report), "utf8");

  console.log(`\nSaved JSON: ${OUT_JSON}`);
  console.log(`Saved MD: ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
