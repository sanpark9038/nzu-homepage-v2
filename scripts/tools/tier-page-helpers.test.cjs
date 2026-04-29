const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const Module = require("module");
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

function registerRootAlias() {
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function resolveWithRootAlias(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
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

registerRootAlias();
registerTypeScriptRequire();

const { buildCompactTeamTierPlayers, buildNamedTierPlayers, NAMED_TIER_LABELS } = require(path.join(ROOT, "lib", "tier-page-helpers.ts"));
const { filterTierPlayers } = require(path.join(ROOT, "lib", "tier-page-helpers.ts"));

runTest("numeric tier 9 players are rendered in the baby tier group", () => {
  const { babyPlayers } = buildNamedTierPlayers([
    {
      id: "player-yuzu",
      name: "Yuzu",
      race: "P",
      tier: "9",
      university: "NCU",
    },
  ]);

  assert.equal(babyPlayers.length, 1);
  assert.equal(babyPlayers[0].id, "player-yuzu");
});

runTest("tier page excludes retired or unwanted player identities", () => {
  const players = filterTierPlayers([
    {
      id: "player-hiyoko",
      name: "Hiyoko",
      eloboard_id: "eloboard:female:889",
      race: "P",
      tier: "8",
      university: "YB",
    },
    {
      id: "player-yuzu",
      name: "Yuzu",
      eloboard_id: "eloboard:female:1024",
      race: "P",
      tier: "9",
      university: "NCU",
    },
  ]);

  assert.deepEqual(
    players.map((player) => player.id),
    ["player-yuzu"]
  );
});

runTest("compact team tier players are ordered by tier groups before race/name sorting", () => {
  const players = buildCompactTeamTierPlayers(
    [
      { id: "tier-8", name: "Tier 8", race: "P", tier: "8", university: "WFU" },
      { id: "spade", name: "Spade", race: "Z", tier: NAMED_TIER_LABELS.spade, university: "WFU" },
      { id: "tier-2", name: "Tier 2", race: "T", tier: "2", university: "WFU" },
      { id: "baby", name: "Baby", race: "P", tier: "9", university: "WFU" },
    ],
    [0, 1, 2, 3, 4, 5, 6, 7, 8]
  );

  assert.deepEqual(
    players.map((player) => player.id),
    ["spade", "tier-2", "tier-8", "baby"]
  );
});
