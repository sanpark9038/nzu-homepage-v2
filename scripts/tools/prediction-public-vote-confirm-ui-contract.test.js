const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("public prediction picks open a confirmation modal before submit", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(source, /const \[pendingVote, setPendingVote\] = useState/);
  assert.match(source, /const confirmVoteButtonRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(source, /function requestVoteConfirmation\(match: PredictionMatch, team: MatchTeam\)/);
  assert.match(source, /if \(myVotes\[match\.id\]\?\.teamCode === team\.teamCode\) return;/);
  assert.match(source, /setPendingVote\(\{ match, team \}\)/);
  assert.match(source, /confirmVoteButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /window\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /setPendingVote\(null\)/);

  assert.doesNotMatch(source, /onPick=\{\(\) => void submitVote\(match\.id, match\.teamA\.teamCode\)\}/);
  assert.doesNotMatch(source, /onPick=\{\(\) => void submitVote\(match\.id, match\.teamB\.teamCode\)\}/);
  assert.match(source, /onPick=\{\(\) => requestVoteConfirmation\(match, match\.teamA\)\}/);
  assert.match(source, /onPick=\{\(\) => requestVoteConfirmation\(match, match\.teamB\)\}/);

  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-hidden=\{pendingVote \? "true" : undefined\}/);
  assert.match(source, /ref=\{confirmVoteButtonRef\}/);
  assert.match(source, /예측 확정/);
  assert.match(source, /취소/);
  assert.match(source, /변경은 마감 전 한 번만 가능합니다/);
  assert.match(source, /void submitVote\(pendingVote\.match\.id, pendingVote\.team\.teamCode\)/);
  assert.match(source, /nowMs: number \| null/);
  assert.match(source, /useState<number \| null>\(null\)/);
  assert.match(source, /if \(nowMs === null\)/);
  assert.match(source, /setNowMs\(Date\.now\(\)\)/);
  assert.doesNotMatch(source, /useState\(Date\.now\(\)\)/);
});
