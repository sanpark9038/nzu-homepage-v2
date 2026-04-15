const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "..");

function registerTypeScriptRequire() {
  const defaultJsLoader = require.extensions[".js"];

  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };

  require.extensions[".js"] = function compileMaybeTsJs(module, filename) {
    if (filename.includes(`${path.sep}node_modules${path.sep}`)) {
      return defaultJsLoader(module, filename);
    }
    const source = fs.readFileSync(filename, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowJs: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };
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

registerTypeScriptRequire();

const {
  applyPlayerServingMetadataToOne,
  getPlayerSearchAliases,
  isExactPlayerSearchMatch,
} = require(path.join(ROOT, "lib", "player-serving-metadata.ts"));

runTest("display alias rewrites homepage name and preserves canonical nickname", () => {
  const actual = applyPlayerServingMetadataToOne({
    name: "박종승",
    nickname: null,
    eloboard_id: "176",
    gender: "male",
    university: "MBU",
    soop_id: null,
  });

  assert.equal(actual.name, "빡죠스");
  assert.equal(actual.nickname, "박종승");
  assert.equal(actual.university, "MBU");
});

runTest("mixed identity only overrides soop_id without polluting canonical name", () => {
  const actual = applyPlayerServingMetadataToOne({
    name: "유즈",
    nickname: null,
    eloboard_id: "eloboard:female:mix:1024",
    gender: "female",
    soop_id: null,
  });

  assert.equal(actual.name, "유즈");
  assert.equal(actual.nickname, null);
  assert.equal(actual.soop_id, "yuzzzz");
});

runTest("non-mix identity never backfills soop_id only by wr_id", () => {
  const actual = applyPlayerServingMetadataToOne({
    name: "유즈",
    nickname: null,
    eloboard_id: "1024",
    gender: "female",
    soop_id: null,
  });

  assert.equal(actual.name, "유즈");
  assert.equal(actual.soop_id, null);
});

runTest("university normalization collapses roster aliases into FA", () => {
  const values = ["연합팀", "늪지대", "NZU", "무소속"];

  const actual = values.map((university) =>
    applyPlayerServingMetadataToOne({
      name: "테스트",
      eloboard_id: null,
      gender: "female",
      university,
    }).university
  );

  assert.deepEqual(actual, ["FA", "FA", "NZU", "FA"]);
});

runTest("exact search matches serving name, canonical nickname, and configured aliases", () => {
  const player = applyPlayerServingMetadataToOne({
    name: "박종승",
    nickname: null,
    eloboard_id: "176",
    gender: "male",
  });

  const aliases = getPlayerSearchAliases(player);
  assert.ok(aliases.includes("빡죠스"));
  assert.equal(isExactPlayerSearchMatch(player, "빡죠스"), true);
  assert.equal(isExactPlayerSearchMatch(player, "박종승"), true);
  assert.equal(isExactPlayerSearchMatch(player, "박단원"), false);
});
