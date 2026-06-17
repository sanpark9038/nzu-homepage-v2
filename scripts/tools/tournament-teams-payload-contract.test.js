const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "..");

function registerTypeScriptRequire() {
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

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
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

const { buildTournamentTeamsClientPayload } = require(path.join(ROOT, "lib", "tournament-home.ts"));

function buildHeavyPlayer(overrides) {
  return {
    id: "player-1",
    name: "Player One",
    nickname: "One",
    race: "P",
    tier: "1",
    university: "WFU",
    photo_url: "https://images.example/profile.jpg",
    channel_profile_image_url: "https://images.example/channel.jpg",
    soop_id: "playerone",
    profile_url: "https://legacy.example/playerone",
    is_live: false,
    broadcast_title: null,
    live_thumbnail_url: null,
    live_viewers: null,
    live_started_at: null,
    broadcast_url: "https://ch.sooplive.co.kr/playerone",
    created_at: "2026-01-01T00:00:00.000Z",
    detailed_stats: { maps: Array.from({ length: 8 }, (_, index) => ({ map: `Map ${index}`, wins: index })) },
    elo_point: 1240,
    eloboard_id: "eloboard:male:1",
    last_synced_at: "2026-06-01T00:00:00.000Z",
    tier_rank: 3,
    total_losses: 12,
    total_wins: 34,
    win_rate: 73.9,
    gender: "male",
    last_checked_at: "2026-06-01T00:00:00.000Z",
    last_match_at: "2026-06-01",
    last_changed_at: "2026-06-01T00:00:00.000Z",
    check_priority: 2,
    check_interval_days: 1,
    match_history: Array.from({ length: 6 }, (_, index) => ({ opponent: `Opponent ${index}`, result: "win" })),
    ...overrides,
  };
}

runTest("public teams payload omits player row fields unused by the teams client cards", () => {
  assert.equal(typeof buildTournamentTeamsClientPayload, "function");

  const teams = [
    {
      teamCode: "t1",
      teamName: "Team One",
      captainPlayerId: "player-1",
      players: [
        buildHeavyPlayer({ id: "player-1", isCaptain: true }),
        buildHeavyPlayer({
          id: "player-2",
          name: "Player Two",
          is_live: true,
          broadcast_title: "Live now",
          live_thumbnail_url: "https://images.example/live.jpg",
          live_viewers: "123",
          live_started_at: "2026-06-01T00:00:00.000Z",
        }),
      ],
    },
  ];

  const payload = buildTournamentTeamsClientPayload(teams);
  const [captain, livePlayer] = payload[0].players;

  assert.deepEqual(Object.keys(payload[0]).sort(), ["players", "teamCode", "teamName"]);
  assert.equal(captain.isCaptain, true);
  assert.equal(captain.channel_profile_image_url, "https://images.example/channel.jpg");
  assert.equal(Object.hasOwn(captain, "photo_url"), false);
  assert.equal(Object.hasOwn(captain, "is_live"), false);
  assert.equal(Object.hasOwn(captain, "broadcast_title"), false);
  assert.equal(Object.hasOwn(captain, "match_history"), false);
  assert.equal(Object.hasOwn(captain, "detailed_stats"), false);
  assert.equal(Object.hasOwn(captain, "total_wins"), false);
  assert.equal(Object.hasOwn(captain, "gender"), false);
  assert.equal(Object.hasOwn(captain, "last_checked_at"), false);

  assert.equal(livePlayer.is_live, true);
  assert.equal(livePlayer.broadcast_title, "Live now");
  assert.equal(livePlayer.live_thumbnail_url, "https://images.example/live.jpg");
  assert.equal(livePlayer.live_viewers, "123");
  assert.equal(livePlayer.live_started_at, "2026-06-01T00:00:00.000Z");

  assert.ok(
    JSON.stringify(payload).length < JSON.stringify(teams).length / 2,
    "teams client payload should be materially smaller than full tournament teams"
  );
});

runTest("teams page passes the slim client payload across the client boundary", () => {
  const viewSource = readProjectFile("components/home/TournamentTeamsView.tsx");
  const clientSource = readProjectFile("components/home/TournamentTeamsClient.tsx");

  assert.match(viewSource, /buildTournamentTeamsClientPayload/);
  assert.match(viewSource, /const clientTeams = buildTournamentTeamsClientPayload\(teams\)/);
  assert.match(viewSource, /<TournamentTeamsClient teams=\{clientTeams\} \/>/);
  assert.match(clientSource, /TournamentTeamsClientTeam/);
  assert.doesNotMatch(clientSource, /TournamentHomeTeam/);
});
