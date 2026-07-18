// 오버레이 접근 게이트 계약 — 등록 선수/승인자만 도구 진입, 신청·승인 API의 권한 경계.
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

test("overlay admin page gates by access status before rendering the tool", () => {
  const source = readProjectFile("app/overlay/admin/page.tsx");
  assert.match(source, /getOverlayAccessStatus\(session\.providerUserId\)/);
  // 게이트 상태에서는 도구가 아니라 AccessGate가 렌더돼야 함
  assert.match(source, /access === "none" \|\| access === "pending"/);
  assert.match(source, /<AccessGate/);
});

test("access status checks registered players then approval table", () => {
  const source = readProjectFile("lib/overlay-access.ts");
  assert.match(source, /from\("players"\)/);
  assert.match(source, /ilike\("soop_id", id\)/);
  assert.match(source, /from\("overlay_access"\)/);
});

test("apply API requires soop session and never accepts a caller-provided id", () => {
  const source = readProjectFile("app/api/overlay/access/route.ts");
  assert.match(source, /parsePublicAuthSessionCookieValue/);
  assert.match(source, /session\.providerUserId/);
  // body에서 id를 받아 저장 대상으로 쓰면 위조 가능 — 세션 값만 사용해야 함
  assert.doesNotMatch(source, /body\.providerUserId|body\.provider_user_id/);
});

test("apply API cannot downgrade an approved user back to pending", () => {
  const source = readProjectFile("app/api/overlay/access/route.ts");
  assert.match(source, /existing\?\.status === "approved"/);
});

test("admin overlay-access API requires the admin password session", () => {
  const source = readProjectFile("app/api/admin/overlay-access/route.ts");
  assert.match(source, /assertValidAdminSession/);
  assert.match(source, /status: 401/);
});

test("admin overlay-access page redirects without admin session", () => {
  const source = readProjectFile("app/admin/overlay-access/page.tsx");
  assert.match(source, /isValidAdminSession/);
  assert.match(source, /redirect\("\/admin\/login\?next=\/admin\/overlay-access"\)/);
});

test("navbar links to the overlay tool", () => {
  const source = readProjectFile("lib/navigation-config.ts");
  assert.match(source, /href: "\/overlay\/admin", label: "스코어보드"/);
});
