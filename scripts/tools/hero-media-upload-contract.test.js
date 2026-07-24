const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("hero media route uses signed direct-upload actions, not server formData", () => {
  const route = readProjectFile("app/api/admin/hero-media/route.ts");
  assert.match(route, /createSignedUploadUrl/);
  assert.match(route, /"sign-upload"/);
  assert.match(route, /"register-upload"/);
  // 유령 행 방지: 등록 전 오브젝트 존재 확인
  assert.match(route, /\.list\(/);
  // Vercel 본문 한도(413) 회피: 옛 formData 업로드 경로 완전 제거
  assert.equal(route.includes("formData"), false);
});

runTest("hero media admin uploads straight to storage via the signed URL", () => {
  const admin = readProjectFile("app/admin/hero-media/HeroMediaAdmin.tsx");
  assert.match(admin, /sign-upload/);
  assert.match(admin, /register-upload/);
  assert.match(admin, /signedUrl/);
  assert.match(admin, /method:\s*"PUT"/);
  // 50MB 프론트 검사 유지
  assert.match(admin, /MAX_RECOMMENDED_VIDEO_SIZE_MB\s*=\s*50/);
  // 옛 formData 업로드 잔재 제거
  assert.equal(admin.includes("new FormData()"), false);
});

console.log("hero media upload contract ok");
