// 조편성 예측(방송 1회성) 계약 —
//  1) 접수 API는 쓰기 전용이고, 서버에서 전부 검증하며, 상한이 있다
//  2) 결과 페이지는 오버레이 접근 게이트 뒤에 있다
//  3) 라우트는 사이트 내비·검색엔진에서 숨는다
//  4) 공개 폼은 호사가 브랜드와 격리된다 (방송용 별개 디자인)
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

test("grouppick 접수는 마감됐다 — 접수 API도 제출 폼도 없다", () => {
  assert.ok(!exists("app/api/grouppick/route.ts"), "접수 API가 되살아나면 마감이 풀린다");
  const page = readProjectFile("app/grouppick/page.tsx");
  assert.doesNotMatch(page, /fetch\(/);
  assert.doesNotMatch(page, /<select/);
});

test("grouppick results page is behind the overlay access gate", () => {
  const source = readProjectFile("app/grouppick/results/page.tsx");
  assert.match(source, /parsePublicAuthSessionCookieValue/);
  assert.match(source, /getOverlayAccessStatus/);
  assert.match(source, /AccessGate/);
});

test("grouppick route is hidden from site chrome and search engines", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /\/grouppick/);
  assert.doesNotMatch(readProjectFile("app/sitemap.ts"), /grouppick/);

  const robots = exists("app/robots.ts") ? "app/robots.ts" : "public/robots.txt";
  assert.doesNotMatch(readProjectFile(robots), /grouppick/);

  assert.match(readProjectFile("app/grouppick/layout.tsx"), /index: false/);
});

test("public grouppick form is isolated from the hosaga brand system", () => {
  const source = readProjectFile("app/grouppick/page.tsx");
  for (const token of ["0b0f1a", "d4a94a", "nzu-"]) {
    assert.ok(!source.includes(token), `app/grouppick/page.tsx must not use brand token ${token}`);
  }
});
