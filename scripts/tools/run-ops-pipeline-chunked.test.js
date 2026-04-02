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
