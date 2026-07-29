// STARNEWS(방송용 뉴스 오버레이) 계약 —
//  1) 상태 API는 세션 소유자의 행만 읽고 쓴다 (공개 조회 경로 없음)
//  2) 송출 페이지는 사이트 내비·검색엔진에서 완전히 숨는다
//  3) 송출 디자인은 호사가 브랜드와 격리된다 (방송 화면은 별개 디자인)
//  4) 송출은 기존 오버레이 실시간 구독을 재사용한다
//  5) 관리자 OBS URL은 view_token으로만 조립한다 (숲 ID 유출 금지)
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("news state API requires a session on both GET and POST", () => {
  const source = readProjectFile("app/api/overlay/news/route.ts");
  assert.match(source, /parsePublicAuthSessionCookieValue/);

  const getBody = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(getBody, /status: 401/);
  assert.match(postBody, /status: 401/);
});

test("news rows are keyed by the session owner's soop id, never by request params", () => {
  const source = readProjectFile("app/api/overlay/news/route.ts");
  assert.match(source, /`news:\$\{session\.providerUserId\}`/);
  // 요청 파라미터로 대상 행을 고를 수 있으면 남의 뉴스 상태를 읽거나 덮어쓸 수 있음
  assert.doesNotMatch(source, /searchParams/);
});

test("news overlay route is hidden from site chrome and search engines", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /\/overlay\/news/);
  assert.doesNotMatch(readProjectFile("app/sitemap.ts"), /overlay\/news/);

  const robots = exists("app/robots.ts") ? "app/robots.ts" : "public/robots.txt";
  assert.doesNotMatch(readProjectFile(robots), /overlay\/news/);

  assert.match(readProjectFile("app/overlay/news/layout.tsx"), /index: false/);
});

test("broadcast design is isolated from the hosaga brand system", () => {
  const files = ["app/overlay/news/page.tsx"];
  const widgetDir = path.join(ROOT, "components", "starnews");
  for (const name of fs.readdirSync(widgetDir)) {
    if (name.endsWith(".tsx")) files.push(`components/starnews/${name}`);
  }

  for (const file of files) {
    const source = readProjectFile(file);
    for (const token of ["0b0f1a", "d4a94a", "nzu-", "Pretendard"]) {
      assert.ok(!source.includes(token), `${file} must not use brand token ${token}`);
    }
  }
});

test("broadcast page reuses the existing overlay live subscription", () => {
  const source = readProjectFile("app/overlay/news/page.tsx");
  assert.match(source, /useOverlayLive/);
  assert.match(source, /normalizeNewsState/);
});

test("new widgets ship schema defaults, renderers, and admin controls together", () => {
  const types = readProjectFile("components/starnews/news-types.ts");
  for (const field of ["topBox", "reporter", "rightItems", "rightSecPerItem"]) {
    assert.ok(types.includes(field), `news-types must define ${field}`);
  }
  // 저장분에 없던 필드가 normalize에서 안 메워지면 송출이 undefined로 죽는다
  const normalize = types.slice(types.indexOf("export function normalizeNewsState"));
  assert.match(normalize, /topBox:/);
  assert.match(normalize, /reporter:/);
  // 요약 박스는 2줄이 상한 (넘치면 방송 화면이 밀린다)
  assert.match(normalize, /slice\(0, 2\)/);

  const widgets = readProjectFile("components/starnews/news-widgets.tsx");
  assert.match(widgets, /export function TopBox/);
  assert.match(widgets, /export function Reporter/);
  // 티커 교체는 롤업 — blur 없이 transform만 쓴다
  assert.match(widgets, /newsRollIn/);
  assert.match(widgets, /newsRollOut/);

  const page = readProjectFile("app/overlay/news/page.tsx");
  assert.match(page, /news\.topBox\.enabled/);
  assert.match(page, /news\.reporter\.enabled/);

  const admin = readProjectFile("app/overlay/news/admin/NewsAdminClient.tsx");
  for (const field of ["topBox", "reporter", "rightItems"]) {
    assert.ok(admin.includes(field), `admin must edit ${field}`);
  }
});

test("live index route is public, cached, and derived from jungman state", () => {
  const source = readProjectFile("app/api/overlay/news/live/route.ts");
  // 송출 화면(비로그인 OBS)이 읽어야 하므로 세션 게이트가 있으면 안 된다
  assert.doesNotMatch(source, /parsePublicAuthSessionCookieValue/);
  assert.match(source, /getJungmanState/);
  assert.match(source, /totalVotes/);
  assert.match(source, /hourDelta/);
  // 방송 중 여러 화면이 붙어도 KV 읽기는 60초에 한 번
  assert.match(source, /60_000|60000/);

  const widgets = readProjectFile("components/starnews/news-widgets.tsx");
  assert.match(widgets, /\/api\/overlay\/news\/live/);
});

test("news admin builds OBS URLs from viewToken, not soop id", () => {
  const source = readProjectFile("app/overlay/news/admin/NewsAdminClient.tsx");
  assert.match(source, /encodeURIComponent\(viewToken\)/);
  assert.doesNotMatch(source, /overlay\/news\?key=\$\{encodeURIComponent\(overlayKey\)\}/);
});
