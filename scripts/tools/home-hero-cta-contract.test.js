const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const homePagePath = path.join(repoRoot, "app/page.tsx");
const source = fs.readFileSync(homePagePath, "utf8");

function assertIncludes(fragment, message) {
  if (!source.includes(fragment)) {
    throw new Error(message);
  }
}

function assertExcludes(fragment, message) {
  if (source.includes(fragment)) {
    throw new Error(message);
  }
}

assertIncludes('href="/prediction"', "Home hero primary CTA must link to /prediction.");
assertIncludes('href="/schedule"', "Home hero secondary CTA must link to /schedule.");
assertIncludes("\uC2B9\uBD80\uC608\uCE21", "Home hero primary CTA must show 승부예측.");
assertIncludes("\uC77C\uC815", "Home hero secondary CTA must show 일정.");

assertExcludes('href="/entry"', "Home hero CTA should no longer link to /entry.");
assertExcludes('href="/teams"', "Home hero CTA should no longer link to /teams.");
assertExcludes("\uC5D4\uD2B8\uB9AC \uBC14\uB85C \uC2DC\uC791", "Home hero should no longer show 엔트리 바로 시작.");
assertExcludes("\uCC38\uAC00\uD300 \uD655\uC778", "Home hero should no longer show 참가팀 확인.");

console.log("home hero CTA contract ok");
