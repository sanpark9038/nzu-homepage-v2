const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const wrId = process.argv[2] || "45";
const PROFILE_URL = `https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;

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

async function main() {
  const profileRes = await axios.get(PROFILE_URL, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000,
  });
  const profileHtml = decodeHtml(profileRes.data);
  const endpoint = "view_list.php";
  const endpointIdx = profileHtml.indexOf(endpoint);
  const slice =
    endpointIdx >= 0
      ? profileHtml.slice(Math.max(0, endpointIdx - 3000), endpointIdx + 3000)
      : profileHtml;

  const pNameMatch =
    slice.match(/p_name\s*:\s*"([^"]+)"/) ||
    slice.match(/p_name\s*:\s*'([^']+)'/) ||
    slice.match(/p_name\s*[:=]\s*["']([^"']+)["']/);
  const pName = pNameMatch ? pNameMatch[1] : null;

  const $profile = cheerio.load(profileHtml);
  const updatesRow = $profile("div#updates").first();
  const moreRowByUpdates = updatesRow.length ? updatesRow.prevAll("div.list-row").first() : null;
  const moreByUpdates = moreRowByUpdates && moreRowByUpdates.length ? moreRowByUpdates.find("a.more[id]").first() : null;
  const boardByUpdates =
    moreRowByUpdates && moreRowByUpdates.length
      ? moreRowByUpdates.prevAll("div.list-board").first()
      : null;
  const moreGlobal = $profile("a.more[id]").first();
  const boardByGlobal = moreGlobal.length
    ? moreGlobal.closest("div.list-row").prevAll("div.list-board").first()
    : null;

  const initialRowsByUpdates = [];
  if (boardByUpdates && boardByUpdates.length) {
    boardByUpdates.find("tbody tr").each((_, tr) => {
      const cells = $profile(tr).find("td");
      if (cells.length < 4) return;
      const date = normalizeDate($profile(cells[0]).text().trim());
      if (!date) return;
      initialRowsByUpdates.push(date);
    });
  }

  const body = qs.stringify({ p_name: pName, last_id: 1 });
  const listRes = await axios.post("https://eloboard.com/men/bbs/view_list.php", body, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: PROFILE_URL,
    },
    timeout: 30000,
  });
  const listHtml = decodeHtml(listRes.data);
  const $ = cheerio.load(listHtml);

  const dates = [];
  const rows = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const date = normalizeDate($(cells[0]).text().trim());
    if (!date) return;
    dates.push(date);
    rows.push({
      date,
      opponent: $(cells[1]).text().trim(),
      result: $(cells[3]).text().trim(),
      note: $(cells[5]).text().trim(),
    });
  });
  dates.sort();

  console.log(
    JSON.stringify(
      {
        wr_id: Number(wrId),
        p_name: pName,
        has_updates_row: updatesRow.length > 0,
        updates_more_id: moreByUpdates && moreByUpdates.length ? Number(moreByUpdates.attr("id")) : null,
        updates_initial_rows: initialRowsByUpdates.length,
        global_more_id: moreGlobal.length ? Number(moreGlobal.attr("id")) : null,
        global_board_rows:
          boardByGlobal && boardByGlobal.length ? boardByGlobal.find("tbody tr").length : 0,
        first_page_row_count: rows.length,
        min_date: dates[0] || null,
        max_date: dates[dates.length - 1] || null,
        sample: rows.slice(0, 5),
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
