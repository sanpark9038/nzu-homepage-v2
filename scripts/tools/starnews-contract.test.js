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

  // 티커 표시는 제거됨(우측 존 폭에서 잘려 사용자 결정으로 철회) — 라우트만 전면 화면 등 다른 용도로 유지
  const widgets = readProjectFile("components/starnews/news-widgets.tsx");
  assert.doesNotMatch(widgets, /\/api\/overlay\/news\/live/);
});

test("main banner shares the ticker bar width and shrinks long headlines instead of clipping", () => {
  const widgets = readProjectFile("components/starnews/news-widgets.tsx");
  // 티커와 같은 고정 폭 — 문구 길이에 따라 흰 바가 늘었다 줄었다 하면 안 된다
  assert.match(widgets, /STAGE_W = 1728/);
  const banner = widgets.slice(widgets.indexOf("export function Banner"), widgets.indexOf("export function LowerThird"));
  assert.match(banner, /width: STAGE_W/);
  // 말줄임(…)으로 자르면 방송 사고 — 글씨 크기를 줄여서 맞춘다
  assert.match(banner, /FitText/);
  assert.doesNotMatch(banner, /textOverflow/);
  // 웹폰트가 늦게 붙으면 첫 측정이 틀린다 — 로드 완료 후 재측정 필수
  const fit = widgets.slice(widgets.indexOf("function FitText"), widgets.indexOf("// ── 표"));
  assert.match(fit, /document\.fonts/);
  assert.match(fit, /scrollWidth/);
});

test("ellipses render as broadcast mid dots in the banner and top box", () => {
  const widgets = readProjectFile("components/starnews/news-widgets.tsx");
  assert.match(widgets, /const midDots = \(text: string\) => text\.replace\(.+"⋯"\)/);
  const banner = widgets.slice(widgets.indexOf("export function Banner"), widgets.indexOf("export function LowerThird"));
  assert.match(banner, /midDots\(banner\.headline\)/);
  const topBox = widgets.slice(widgets.indexOf("export function TopBox"), widgets.indexOf("export function Reporter"));
  assert.match(topBox, /midDots\(line\)/);
  // 티커 문구는 기존 "…" 표기 관례를 유지한다
  const ticker = widgets.slice(widgets.indexOf("export function Ticker"), widgets.indexOf("// ── 메인 자막바"));
  assert.doesNotMatch(ticker, /midDots/);
});

test("layout controls allow 1-unit numeric nudging, not sliders alone", () => {
  const admin = readProjectFile("app/overlay/news/admin/NewsAdminClient.tsx");
  // 공용 Slider 한 곳에 스테퍼가 붙어야 전 위젯(티커 y 포함)에 적용된다
  const slider = admin.slice(admin.indexOf("function Slider"), admin.indexOf("function LayoutFields"));
  assert.match(slider, /nudge\(-1\)/);
  assert.match(slider, /nudge\(1\)/);
  assert.match(slider, /inputMode="numeric"/);
  assert.match(slider, /ArrowUp/);
  // 배너 섹션 표시 이름은 "메인 자막" (스키마 필드명 banner는 유지)
  assert.match(admin, /title="메인 자막"/);
  assert.match(admin, /patch\("banner"/);
});

test("news admin builds OBS URLs from viewToken, not soop id", () => {
  const source = readProjectFile("app/overlay/news/admin/NewsAdminClient.tsx");
  assert.match(source, /encodeURIComponent\(viewToken\)/);
  assert.doesNotMatch(source, /overlay\/news\?key=\$\{encodeURIComponent\(overlayKey\)\}/);
});
