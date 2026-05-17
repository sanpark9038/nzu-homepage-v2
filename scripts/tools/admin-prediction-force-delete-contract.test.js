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

test("admin prediction API requires an explicit confirmation phrase for vote-inclusive delete", () => {
  const source = readProjectFile("app/api/admin/prediction/route.ts");

  assert.match(source, /FORCE_DELETE_CONFIRMATION/);
  assert.match(source, /delete_votes/);
  assert.match(source, /confirm_text/);
  assert.match(source, /prediction_force_delete_confirmation_required/);
  assert.match(source, /deletePredictionMatchWithVotes\(matchId\)/);
});

test("admin prediction UI separates protected delete from vote-inclusive cleanup", () => {
  const source = readProjectFile("app/admin/prediction/PredictionMatchAdmin.tsx");

  assert.match(source, /handleDeleteWithVotes/);
  assert.match(source, /투표 포함 완전 삭제/);
  assert.match(source, /삭제 문구를 정확히 입력/);
  assert.match(source, /delete_votes: true/);
  assert.match(source, /confirm_text: FORCE_DELETE_CONFIRMATION/);
});
