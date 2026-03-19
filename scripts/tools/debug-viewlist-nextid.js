const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const wrId = process.argv[2] || "21";
const maxPages = Number(process.argv[3] || 10);
const profileUrl = `https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;

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

function extractNextLastId(html) {
  const $ = cheerio.load(html);
  const hidden = Number($('input[name="last_id"]').val() || 0);
  if (Number.isFinite(hidden) && hidden > 0) return hidden;

  const moreId = Number($("a.more[id]").last().attr("id") || 0);
  if (Number.isFinite(moreId) && moreId > 0) return moreId;

  const moreBoxId = $("div.morebox[id]").last().attr("id") || "";
  const m = moreBoxId.match(/^more(\d+)$/);
  if (m) return Number(m[1]);
  return 0;
}

async function main() {
  const profileRes = await axios.get(profileUrl, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000,
  });
  const profileHtml = decodeHtml(profileRes.data);
  const pNameMatch =
    profileHtml.match(/p_name\s*:\s*"([^"]+)"/) ||
    profileHtml.match(/p_name\s*:\s*'([^']+)'/) ||
    profileHtml.match(/p_name\s*[:=]\s*["']([^"']+)["']/);
  const pName = pNameMatch ? pNameMatch[1] : null;

  let lastId = 1;
  const pages = [];

  for (let i = 0; i < maxPages && lastId > 0; i += 1) {
    const body = qs.stringify({ p_name: pName, last_id: lastId });
    const res = await axios.post("https://eloboard.com/men/bbs/view_list.php", body, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: profileUrl,
      },
      timeout: 30000,
    });
    const html = decodeHtml(res.data);
    const $ = cheerio.load(html);
    const dates = [];
    $("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 4) return;
      const d = normalizeDate($(cells[0]).text().trim());
      if (d) dates.push(d);
    });
    dates.sort();
    const next = extractNextLastId(html);
    pages.push({
      request_last_id: lastId,
      rows: dates.length,
      min_date: dates[0] || null,
      max_date: dates[dates.length - 1] || null,
      next_last_id: next,
    });
    if (!next || next === lastId) break;
    lastId = next;
  }

  console.log(
    JSON.stringify(
      {
        wr_id: Number(wrId),
        p_name: pName,
        pages,
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

