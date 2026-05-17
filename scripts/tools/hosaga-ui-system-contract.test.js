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

test("global HOSAGA UI tokens define a readable dark surface system", () => {
  const css = readProjectFile("app/globals.css");

  assert.match(css, /--background:\s*#10171c/i);
  assert.match(css, /--card:\s*#151e24/i);
  assert.match(css, /--muted:\s*#19242b/i);
  assert.match(css, /--hosaga-text-label:\s*0\.8125rem/);
  assert.match(css, /--hosaga-text-body:\s*1rem/);
  assert.match(css, /--hosaga-text-title:\s*1\.25rem/);
});

test("global HOSAGA UI utilities prevent tiny repeated page-by-page typography", () => {
  const css = readProjectFile("app/globals.css");

  assert.match(css, /\.ui-label/);
  assert.match(css, /\.ui-copy/);
  assert.match(css, /\.ui-value/);
  assert.match(css, /\.ui-card-title/);
  assert.match(css, /\.ui-surface/);
  assert.match(css, /\.ui-subtle-surface/);
});

test("prediction UI consumes the shared typography and surface utilities", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(source, /ui-label/);
  assert.match(source, /ui-value/);
  assert.match(source, /ui-card-title/);
  assert.match(source, /ui-surface/);
  assert.doesNotMatch(source, /text-\[11px\]/);
});
