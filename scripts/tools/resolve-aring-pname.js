const axios = require("axios");
const iconv = require("iconv-lite");

async function main() {
  const url = "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=953";
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 20000,
  });

  const buf = Buffer.from(res.data);
  const utf8 = buf.toString("utf8");
  const euc = iconv.decode(buf, "euc-kr");

  const candidates = [];
  for (const html of [utf8, euc]) {
    const m1 = html.match(/p_name\s*[:=]\s*["']([^"']+)["']/i);
    if (m1) candidates.push(m1[1]);
    const m2 = html.match(/name=["']p_name["'][^>]*value=["']([^"']+)["']/i);
    if (m2) candidates.push(m2[1]);
    const m3 = html.match(/view_list\.php[\s\S]{0,300}/i);
    if (m3) {
      const mm = m3[0].match(/["']p_name["']\s*[:=]\s*["']([^"']+)["']/i);
      if (mm) candidates.push(mm[1]);
    }
  }

  const unique = [...new Set(candidates)];
  console.log(JSON.stringify({ p_name_candidates: unique }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
