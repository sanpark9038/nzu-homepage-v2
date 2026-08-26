// 일회성 검증: GitHub Actions(화면 없는 리눅스)에서 위장 크롬으로 엘로보드 Cloudflare 검문을
// 통과해 cf_clearance 통행증을 얻을 수 있는지만 확인한다. 파이프라인과 무관하며, 성공하면
// "브라우저 자동화 무료 경로가 서버에서도 된다"가 증명된다. 실패해도 저장소에 남기지 않는다(수동 삭제).
//
// 실측 기반(2026-08-26, 로컬): 스크립트 단독=403, 헤드리스=미통과, 진짜 크롬(headed)=통과+쿠키획득.
// 서버엔 화면이 없으므로 xvfb 가상 디스플레이 위에서 headed 크롬을 띄운다(headless:false).

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const TARGET =
  process.env.CF_TARGET ||
  "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1048";
const MAX_WAIT_MS = 45000;

function classify(html) {
  const t = String(html || "");
  if (/list-board|전적사이트|총전적/.test(t)) return "PASS_PROFILE";
  if (/just a moment|cf_chl|challenge-platform|cf-mitigated/i.test(t)) return "CF_CHALLENGE";
  return "UNKNOWN";
}

(async () => {
  const started = Date.now();
  const browser = await puppeteer.launch({
    headless: false, // xvfb 위의 headed 모드 — 로컬 실측에서 이것만 통과했다.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1280,900",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

    // 검문이 자바스크립트로 자가 통과할 시간을 준다. 정상 표식이 뜨거나 시간이 다 될 때까지 폴링.
    let verdict = "UNKNOWN";
    let lastLen = 0;
    while (Date.now() - started < MAX_WAIT_MS) {
      const html = await page.content().catch(() => "");
      lastLen = html.length;
      verdict = classify(html);
      if (verdict === "PASS_PROFILE") break;
      await new Promise((r) => setTimeout(r, 2500));
    }

    const cookies = await page.cookies().catch(() => []);
    const clearance = cookies.find((c) => c.name === "cf_clearance");

    console.log("=== CF BYPASS 검증 결과 ===");
    console.log("target:", TARGET);
    console.log("elapsed_ms:", Date.now() - started);
    console.log("dom_bytes:", lastLen);
    console.log("verdict:", verdict);
    console.log("cf_clearance:", clearance ? "획득 ✅" : "없음 ❌");
    // 통행증을 실제로 스크립트 요청에 재사용할 수 있는지까지 봐야 완결이다: 같은 쿠키+UA로 fetch.
    if (clearance) {
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const res = await fetch(TARGET, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Cookie: cookieHeader,
        },
      }).catch((e) => ({ status: "fetch_fail:" + e.message, text: async () => "" }));
      const body = await (res.text ? res.text() : Promise.resolve(""));
      console.log("쿠키 재사용 fetch:", res.status, classify(body));
    }
    console.log("OVERALL:", verdict === "PASS_PROFILE" && clearance ? "SUCCESS" : "FAIL");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
