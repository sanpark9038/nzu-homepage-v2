// 오버레이 공개 URL 토큰 계약 — 숲 ID로는 남의 오버레이 상태를 절대 조회할 수 없어야 한다.
// (숲 ID는 추측이 쉬워 대진표 라인업이 경기 전에 유출됨 → 공개 조회는 view_token으로만)
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
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

test("public GET looks up by view_token only — never by overlay_key", () => {
  const source = readProjectFile("app/api/overlay/state/route.ts");

  // 공개 조회(key 파라미터)는 view_token 컬럼으로만
  assert.match(source, /\.eq\("view_token", key\)/);
  // key 파라미터를 overlay_key 조회에 쓰는 코드가 없어야 함 (숲 ID 유출 경로)
  assert.doesNotMatch(source, /\.eq\("overlay_key", key\)/);
});

test("session GET issues a view token when missing", () => {
  const source = readProjectFile("app/api/overlay/state/route.ts");
  assert.match(source, /generateViewToken/);
  assert.match(source, /viewToken/);
});

test("POST writes only to the session owner's overlay_key", () => {
  const source = readProjectFile("app/api/overlay/state/route.ts");
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(postBody, /const overlayKey = session\.providerUserId/);
  // POST가 요청 파라미터의 key로 저장 대상을 정하면 안 됨
  assert.doesNotMatch(postBody, /searchParams/);
});

test("token regenerate route requires session", () => {
  const source = readProjectFile("app/api/overlay/token/route.ts");
  assert.match(source, /parsePublicAuthSessionCookieValue/);
  assert.match(source, /status: 401/);
});

test("admin client builds OBS URLs from viewToken, not soop id", () => {
  const source = readProjectFile("app/overlay/admin/OverlayAdminClient.tsx");
  assert.match(source, /encodeURIComponent\(viewToken\)/);
  assert.doesNotMatch(source, /overlay\/scoreboard\?key=\$\{encodeURIComponent\(overlayKey\)\}/);
  assert.doesNotMatch(source, /overlay\/entry\?key=\$\{encodeURIComponent\(overlayKey\)\}/);
});

test("database types include overlay_state.view_token", () => {
  const source = readProjectFile("lib/database.types.ts");
  assert.match(source, /view_token: string \| null/);
});
