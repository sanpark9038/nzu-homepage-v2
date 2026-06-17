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
const {
  buildPackedTierPlayersPayload,
  buildTierPlayerPayload,
  unpackTierPlayersPayload,
} = require(path.join(ROOT, "lib", "tier-player-payload.ts"));
const { getTierLabel, normalizeTier } = require(path.join(ROOT, "lib", "utils.ts"));

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

runTest("compact team tier players include tier suffix aliases and ungrouped players", () => {
  const players = buildCompactTeamTierPlayers(
    [
      { id: "unknown", name: "Unknown", race: "Z", tier: "미정", university: "YB" },
      { id: "jack-suffix", name: "Jack Suffix", race: "T", tier: "잭티어", university: "YB" },
      { id: "tier-4", name: "Tier 4", race: "P", tier: "4", university: "YB" },
    ],
    [0, 1, 2, 3, 4, 5, 6, 7, 8]
  );

  assert.deepEqual(
    players.map((player) => player.id),
    ["jack-suffix", "tier-4", "unknown"]
  );
});

runTest("tier labels normalize Korean tier suffixes before badge display", () => {
  assert.equal(normalizeTier("\uc7ad\ud2f0\uc5b4"), "\uc7ad");
  assert.equal(getTierLabel("\uc7ad\ud2f0\uc5b4"), "\uc7ad");
});

runTest("tier API payload omits unused media fields while preserving card fallbacks", () => {
  const livePayload = buildTierPlayerPayload({
    id: "live-player",
    name: "Live Player",
    nickname: "Live",
    race: "P",
    gender: "male",
    tier: "1",
    university: "WFU",
    is_live: true,
    broadcast_title: "Live now",
    channel_profile_image_url: "https://images.example/channel.jpg",
    live_thumbnail_url: "https://images.example/live.jpg",
    photo_url: "https://images.example/profile.jpg",
    soop_id: "live_soop",
  });

  assert.equal(livePayload.broadcast_title, "Live now");
  assert.equal(livePayload.channel_profile_image_url, "https://images.example/channel.jpg");
  assert.equal(livePayload.live_thumbnail_url, "https://images.example/live.jpg");
  assert.equal(Object.hasOwn(livePayload, "soop_id"), false);
  assert.equal(Object.hasOwn(livePayload, "photo_url"), false);

  const offlinePayload = buildTierPlayerPayload({
    id: "offline-player",
    name: "Offline Player",
    nickname: null,
    race: "T",
    gender: "female",
    tier: "2",
    university: "YB",
    is_live: false,
    broadcast_title: null,
    channel_profile_image_url: null,
    live_thumbnail_url: null,
    photo_url: "https://images.example/offline.jpg",
    soop_id: "offline_soop",
  });

  assert.equal(offlinePayload.photo_url, "https://images.example/offline.jpg");
  assert.equal(Object.hasOwn(offlinePayload, "soop_id"), false);
  assert.equal(Object.hasOwn(offlinePayload, "broadcast_title"), false);
  assert.equal(Object.hasOwn(offlinePayload, "channel_profile_image_url"), false);
  assert.equal(Object.hasOwn(offlinePayload, "live_thumbnail_url"), false);

  const soopFallbackPayload = buildTierPlayerPayload({
    id: "soop-fallback-player",
    name: "Soop Fallback Player",
    nickname: null,
    race: "Z",
    gender: "female",
    tier: "3",
    university: "DM",
    is_live: false,
    broadcast_title: null,
    channel_profile_image_url: null,
    live_thumbnail_url: null,
    photo_url: null,
    soop_id: "fallback_soop",
  });

  assert.equal(soopFallbackPayload.soop_id, "fallback_soop");
  assert.equal(Object.hasOwn(soopFallbackPayload, "photo_url"), false);
  assert.equal(Object.hasOwn(soopFallbackPayload, "channel_profile_image_url"), false);
});

runTest("tier API packed payload preserves fields with smaller JSON", () => {
  const players = [
    {
      id: "live-player",
      name: "Live Player",
      nickname: "Live",
      race: "P",
      gender: "male",
      tier: "1",
      university: "WFU",
      is_live: true,
      broadcast_title: "Live now",
      channel_profile_image_url: "https://images.example/channel.jpg",
      live_thumbnail_url: "https://images.example/live.jpg",
      photo_url: "https://images.example/profile.jpg",
      soop_id: "live_soop",
    },
    {
      id: "offline-player",
      name: "Offline Player",
      nickname: null,
      race: "T",
      gender: "female",
      tier: "2",
      university: "YB",
      is_live: false,
      broadcast_title: null,
      channel_profile_image_url: null,
      live_thumbnail_url: null,
      photo_url: "https://images.example/offline.jpg",
      soop_id: "offline_soop",
    },
    {
      id: "soop-fallback-player",
      name: "Soop Fallback Player",
      nickname: null,
      race: "Z",
      gender: "female",
      tier: "3",
      university: "DM",
      is_live: false,
      broadcast_title: null,
      channel_profile_image_url: null,
      live_thumbnail_url: null,
      photo_url: null,
      soop_id: "fallback_soop",
    },
  ];

  const objectPayload = {
    liveOnly: false,
    players: players.map(buildTierPlayerPayload),
    generatedAt: "2026-06-14T00:00:00.000Z",
  };
  const packedPayload = buildPackedTierPlayersPayload(players, {
    liveOnly: false,
    generatedAt: objectPayload.generatedAt,
  });

  assert.deepEqual(packedPayload.fields, [
    "id",
    "name",
    "nickname",
    "race",
    "gender",
    "tier",
    "university",
    "is_live",
    "broadcast_title",
    "channel_profile_image_url",
    "live_thumbnail_url",
    "photo_url",
    "soop_id",
  ]);
  assert.equal(Array.isArray(packedPayload.players[0]), true);
  assert.equal(Object.hasOwn(packedPayload.players[0], "id"), false);
  assert.deepEqual(unpackTierPlayersPayload(packedPayload), objectPayload);
  assert.ok(
    JSON.stringify(packedPayload).length < JSON.stringify(objectPayload).length,
    "Packed tier API payload should avoid repeated object keys"
  );
});
