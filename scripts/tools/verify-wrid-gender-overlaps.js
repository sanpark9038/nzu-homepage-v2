const axios = require("axios");
const iconv = require("iconv-lite");

const TARGET_WR_IDS = [44, 57];

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const euc = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEuc = (euc.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEuc ? utf8 : euc;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });
  return decodeHtml(res.data);
}

function parseName(html) {
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (og && og[1]) return og[1].trim();

  const pName = html.match(/name=["']p_name["'][^>]*value=["']([^"']+)["']/i);
  if (pName && pName[1]) return pName[1].trim();

  const title = html.match(/<title>([^<]+)<\/title>/i);
  if (title && title[1]) return title[1].trim();

  return null;
}

async function main() {
  const out = [];
  for (const wrId of TARGET_WR_IDS) {
    const maleUrl = `https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
    const femaleUrl = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
    const row = { wr_id: wrId, male: null, female: null, same_name: false };
    try {
      const maleHtml = await fetchHtml(maleUrl);
      row.male = parseName(maleHtml);
    } catch (e) {
      row.male = `ERROR: ${e.message}`;
    }
    try {
      const femaleHtml = await fetchHtml(femaleUrl);
      row.female = parseName(femaleHtml);
    } catch (e) {
      row.female = `ERROR: ${e.message}`;
    }
    row.same_name = Boolean(row.male && row.female && row.male === row.female);
    out.push(row);
  }

  console.log(JSON.stringify({ checked_at: new Date().toISOString(), rows: out }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
