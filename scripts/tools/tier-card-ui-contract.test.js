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

test("tier player cards use shared readable typography utilities", () => {
  const source = readProjectFile("components/players/TierPlayerCard.tsx");

  assert.match(source, /ui-card-title/);
  assert.match(source, /ui-label/);
  assert.match(source, /ui-value/);
  assert.doesNotMatch(source, /text-\[10px\]/);
  assert.doesNotMatch(source, /text-\[11px\]/);
  assert.doesNotMatch(source, /text-\[12px\]/);
});

test("tier quick h2h action uses the same label scale as card actions", () => {
  const source = readProjectFile("components/players/TierQuickH2HButton.tsx");

  assert.match(source, /ui-label/);
  assert.doesNotMatch(source, /text-\[12px\]/);
});
