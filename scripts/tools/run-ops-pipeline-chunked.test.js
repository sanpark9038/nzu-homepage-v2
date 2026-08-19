const assert = require("node:assert/strict");

const { splitIntoChunksWithDedicatedTeams } = require("./run-ops-pipeline-chunked");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("splitIntoChunksWithDedicatedTeams isolates fa into its own chunk", () => {
  const actual = splitIntoChunksWithDedicatedTeams(
    ["bgm", "black", "c9", "fa", "hm", "jsa", "ku"],
    3,
    ["fa"]
  );

  assert.deepEqual(actual, [
    ["bgm", "black", "c9"],
    ["hm", "jsa", "ku"],
    ["fa"],
  ]);
});

runTest("splitIntoChunksWithDedicatedTeams keeps default chunking when no dedicated teams exist", () => {
  const actual = splitIntoChunksWithDedicatedTeams(["bgm", "black", "c9", "hm"], 3, ["fa"]);

  assert.deepEqual(actual, [
    ["bgm", "black", "c9"],
    ["hm"],
  ]);
});

// 2026-08-19 실사고 재발 방지: 아침 run이 남긴 장애 마커가 캐시로 복원돼, 보드가 회복된
// 낮의 수동 재시도까지 같은 날짜라는 이유로 전부 스킵됐다. 마커는 run 시작마다 청소한다.
runTest("clearSourceOutageMarkers removes only outage markers and reports them", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { clearSourceOutageMarkers } = require("./run-ops-pipeline-chunked");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outage-marker-"));
  fs.writeFileSync(path.join(dir, "source_outage_2026-08-19.marker"), "{}");
  fs.writeFileSync(path.join(dir, "source_outage_2026-08-18.marker"), "{}");
  fs.writeFileSync(path.join(dir, "keep_me.json"), "{}");

  const cleared = clearSourceOutageMarkers(dir).sort();

  assert.deepEqual(cleared, [
    "source_outage_2026-08-18.marker",
    "source_outage_2026-08-19.marker",
  ]);
  assert.deepEqual(fs.readdirSync(dir), ["keep_me.json"]);
  // 없는 디렉터리는 빈 목록으로 조용히 통과(첫 run 등 tmp가 아직 없을 때).
  assert.deepEqual(clearSourceOutageMarkers(path.join(dir, "no-such-dir")), []);
});
