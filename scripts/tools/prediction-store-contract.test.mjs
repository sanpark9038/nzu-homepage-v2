import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const moduleCache = new Map();

function resolveProjectModule(specifier, fromPath) {
  if (specifier.startsWith("@/")) {
    const basePath = path.join(repoRoot, specifier.slice(2));
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
  }

  if (!specifier.startsWith(".")) return null;
  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function loadProjectModule(filePath) {
  const absolutePath = path.normalize(filePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached.exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  });

  const localRequire = (specifier) => {
    const resolvedProjectModule = resolveProjectModule(specifier, absolutePath);
    if (resolvedProjectModule) return loadProjectModule(resolvedProjectModule);
    return require(specifier);
  };

  const runModule = vm.runInThisContext(
    `(function(require, module, exports, __dirname, __filename) {\n${outputText}\n})`,
    { filename: absolutePath }
  );
  runModule(localRequire, module, module.exports, path.dirname(absolutePath), absolutePath);
  return module.exports;
}

const predictionStore = loadProjectModule(path.join(repoRoot, "lib", "prediction-store.ts"));
const tournamentPrediction = loadProjectModule(path.join(repoRoot, "lib", "tournament-prediction.ts"));
const predictionAdminVoters = loadProjectModule(path.join(repoRoot, "lib", "prediction-admin-voters.ts"));

function makePredictionPlayer(overrides = {}) {
  return {
    id: "bd78f78a-3bea-441d-9999-f0070e332103",
    name: "Player",
    race: "T",
    tier: "S",
    university: "Team",
    photo_url: null,
    broadcast_title: null,
    broadcast_url: null,
    created_at: null,
    detailed_stats: null,
    elo_point: null,
    eloboard_id: null,
    is_live: false,
    last_synced_at: null,
    live_thumbnail_url: null,
    match_history: null,
    nickname: null,
    soop_id: null,
    tier_rank: null,
    total_losses: null,
    total_wins: null,
    win_rate: null,
    gender: null,
    last_checked_at: null,
    last_match_at: null,
    last_changed_at: null,
    check_priority: null,
    check_interval_days: null,
    ...overrides,
  };
}

test("prediction SQL creates remote match and vote tables", () => {
  const sql = fs.readFileSync(path.join(repoRoot, "scripts", "sql", "create-prediction-tables.sql"), "utf8");

  assert.match(sql, /create table if not exists public\.prediction_matches/i);
  assert.match(sql, /create table if not exists public\.prediction_votes/i);
  assert.match(sql, /team_a_player_ids text\[\] not null default '\{\}'::text\[\]/i);
  assert.match(sql, /team_b_player_ids text\[\] not null default '\{\}'::text\[\]/i);
  assert.match(sql, /match_type text not null default 'team'/i);
  assert.match(sql, /team_mode text not null default 'existing'/i);
  assert.match(sql, /team_a_name text null/i);
  assert.match(sql, /team_b_name text null/i);
  assert.match(sql, /entry_order_status text not null default 'unknown'/i);
  assert.match(sql, /entry_matchups jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql, /match_id uuid not null references public\.prediction_matches\(id\)/i);
  assert.match(sql, /voter_provider text null/i);
  assert.match(sql, /voter_provider_user_id text null/i);
  assert.match(sql, /voter_display_name text null/i);
  assert.match(sql, /voter_avatar_url text null/i);
  assert.match(sql, /unique \(voter_id, match_id\)/i);
  assert.match(sql, /alter table public\.prediction_matches enable row level security/i);
  assert.match(sql, /alter table public\.prediction_votes enable row level security/i);
});

test("prediction voter ids come from a signed public auth session", () => {
  assert.equal(
    predictionStore.getPredictionVoterId({
      provider: "soop",
      providerUserId: "soop-user-1",
      displayName: "SOOP User",
    }),
    "soop:soop-user-1"
  );

  assert.throws(() => predictionStore.getPredictionVoterId(null), /prediction_login_required/);
});

test("prediction vote identity stores SOOP fixed id and display nickname", () => {
  assert.deepEqual(
    predictionStore.getPredictionVoteIdentity({
      provider: "soop",
      providerUserId: "fixed-soop-id",
      displayName: "Visible Nickname",
      avatarUrl: "https://example.com/a.png",
    }),
    {
      voter_id: "soop:fixed-soop-id",
      voter_provider: "soop",
      voter_provider_user_id: "fixed-soop-id",
      voter_display_name: "Visible Nickname",
      voter_avatar_url: "https://example.com/a.png",
    }
  );
});

test("public prediction payload helpers do not expose voter identity fields", () => {
  const playerA = makePredictionPlayer({
    id: "bd78f78a-3bea-441d-9999-f0070e332103",
    name: "김지성",
    university: "A",
  });
  const playerB = makePredictionPlayer({
    id: "c402cbde-0c6d-454d-8083-3083d7974556",
    name: "박하악",
    university: "B",
  });
  const state = {
    matches: [
      {
        id: "match-private",
        match_type: "individual",
        team_a_code: `player:${playerA.id}`,
        team_b_code: `player:${playerB.id}`,
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        title: "중장전 1경기",
        start_at: "2026-05-05T13:00:00.000Z",
        close_at: "2026-05-05T12:30:00.000Z",
        status: "open",
      },
    ],
    votes: [
      {
        voter_id: "soop:fixed-private-id",
        voter_provider: "soop",
        voter_provider_user_id: "fixed-private-id",
        voter_display_name: "비공개닉",
        voter_avatar_url: "https://example.com/private.png",
        match_id: "match-private",
        picked_team_code: `player:${playerA.id}`,
        updated_at: "2026-05-05T12:00:00.000Z",
      },
    ],
  };

  const publicPayload = {
    ok: true,
    matches: tournamentPrediction.buildTournamentPredictionMatches([playerA, playerB], state),
    myVotes: predictionStore.getPredictionMyVotes(state.votes, "soop:fixed-private-id"),
  };
  const serialized = JSON.stringify(publicPayload);

  assert.equal(publicPayload.myVotes["match-private"].teamCode, `player:${playerA.id}`);
  assert.doesNotMatch(serialized, /fixed-private-id/);
  assert.doesNotMatch(serialized, /비공개닉/);
  assert.doesNotMatch(serialized, /private\.png/);
  assert.doesNotMatch(serialized, /voter_id|voter_provider|voter_provider_user_id|voter_display_name|voter_avatar_url/);
});

test("buildTournamentPredictionMatches respects an explicitly empty remote state", () => {
  const matches = tournamentPrediction.buildTournamentPredictionMatches([], {
    matches: [],
    votes: [],
  });

  assert.deepEqual(matches, []);
});

test("buildTournamentPredictionMatches sorts public cards by nearest vote deadline", () => {
  const playerA = makePredictionPlayer({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Player A",
  });
  const playerB = makePredictionPlayer({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Player B",
  });

  const matches = tournamentPrediction.buildTournamentPredictionMatches([playerA, playerB], {
    matches: [
      {
        id: "later-deadline",
        match_type: "individual",
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        title: "Later deadline",
        start_at: "2026-05-24T12:00:00.000Z",
        close_at: "2026-05-24T11:30:00.000Z",
        status: "open",
      },
      {
        id: "earlier-deadline",
        match_type: "individual",
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        title: "Earlier deadline",
        start_at: "2026-05-20T12:00:00.000Z",
        close_at: "2026-05-20T11:30:00.000Z",
        status: "open",
      },
    ],
    votes: [],
  });

  assert.deepEqual(
    matches.map((match) => match.id),
    ["earlier-deadline", "later-deadline"]
  );
});

test("prediction admin voter helpers summarize and label SOOP fixed ids", () => {
  const match = {
    id: "match-1",
    team_a_code: "team-a",
    team_a_name: "철구팀",
    team_b_code: "team-b",
    team_b_name: "봉준팀",
    result_team_code: "team-a",
    result_published_at: "2026-05-05T12:00:00.000Z",
  };
  const votes = [
    {
      voter_id: "soop:fixed-a",
      voter_provider_user_id: "fixed-a",
      voter_display_name: "닉A",
      match_id: "match-1",
      picked_team_code: "team-a",
      updated_at: "2026-05-05T11:00:00.000Z",
      change_count: 0,
    },
    {
      voter_id: "soop:fixed-b",
      voter_provider_user_id: "fixed-b",
      voter_display_name: "닉B",
      match_id: "match-1",
      picked_team_code: "team-b",
      updated_at: "2026-05-05T11:05:00.000Z",
      change_count: 1,
    },
  ];

  const summary = predictionAdminVoters.summarizePredictionVoters(match, votes);
  const rows = predictionAdminVoters.buildPredictionVoterRows(match, votes);

  assert.deepEqual(summary, {
    total: 2,
    teamA: 1,
    teamB: 1,
    pending: 0,
    correct: 1,
    wrong: 1,
  });
  assert.equal(rows[0].fixedId, "fixed-a");
  assert.equal(rows[0].displayName, "닉A");
  assert.equal(rows[0].pickLabel, "철구팀");
  assert.equal(rows[0].result, "correct");
  assert.equal(rows[1].fixedId, "fixed-b");
  assert.equal(rows[1].result, "wrong");
});

test("prediction admin voter helpers filter, paginate, and export SOOP ids as CSV", () => {
  const match = {
    id: "match-1",
    team_a_code: "team-a",
    team_a_name: "철구팀",
    team_b_code: "team-b",
    team_b_name: "봉준팀",
    result_team_code: "team-a",
    result_published_at: "2026-05-05T12:00:00.000Z",
  };
  const rows = predictionAdminVoters.buildPredictionVoterRows(match, [
    {
      voter_id: "soop:fixed-a",
      voter_provider_user_id: "fixed-a",
      voter_display_name: "닉A",
      match_id: "match-1",
      picked_team_code: "team-a",
      updated_at: "2026-05-05T11:00:00.000Z",
      change_count: 0,
    },
    {
      voter_id: "soop:fixed-b",
      voter_provider_user_id: "fixed-b",
      voter_display_name: "닉B",
      match_id: "match-1",
      picked_team_code: "team-b",
      updated_at: "2026-05-05T11:05:00.000Z",
      change_count: 1,
    },
  ]);

  assert.deepEqual(
    predictionAdminVoters.filterPredictionVoterRows(rows, { query: "fixed-b", filter: "wrong" }).map((row) => row.fixedId),
    ["fixed-b"]
  );
  assert.deepEqual(
    predictionAdminVoters.paginatePredictionVoterRows(rows, 2, 1).map((row) => row.fixedId),
    ["fixed-b"]
  );

  const csv = predictionAdminVoters.buildPredictionVoterCsv(rows);
  assert.match(csv, /^닉네임,SOOP 고정 ID,선택,결과,투표 시간,변경 횟수/m);
  assert.match(csv, /닉A,fixed-a,철구팀,적중,2026-05-05T11:00:00.000Z,0/);
  assert.match(csv, /닉B,fixed-b,봉준팀,실패,2026-05-05T11:05:00.000Z,1/);
});

test("prediction matches can be physically deleted only when no votes exist", () => {
  const state = {
    matches: [
      { id: "match-empty", team_a_code: "team-a", team_b_code: "team-b" },
      { id: "match-voted", team_a_code: "team-a", team_b_code: "team-b" },
    ],
    votes: [
      {
        voter_id: "soop:user-1",
        match_id: "match-voted",
        picked_team_code: "team-a",
        updated_at: "2026-05-05T11:00:00.000Z",
      },
    ],
  };

  assert.equal(predictionStore.assertPredictionMatchCanBeDeleted(state, "match-empty"), true);
  assert.throws(
    () => predictionStore.assertPredictionMatchCanBeDeleted(state, "match-voted"),
    /prediction_delete_has_votes/
  );
  assert.throws(
    () => predictionStore.assertPredictionMatchCanBeDeleted(state, "missing-match"),
    /prediction_match_not_found/
  );
});

test("force deleting a prediction match removes only that match and its votes", () => {
  const state = {
    matches: [
      { id: "match-keep", team_a_code: "team-a", team_b_code: "team-b" },
      { id: "match-test", team_a_code: "team-a", team_b_code: "team-b" },
    ],
    votes: [
      {
        voter_id: "soop:user-1",
        match_id: "match-test",
        picked_team_code: "team-a",
        updated_at: "2026-05-05T11:00:00.000Z",
      },
      {
        voter_id: "soop:user-2",
        match_id: "match-keep",
        picked_team_code: "team-b",
        updated_at: "2026-05-05T11:05:00.000Z",
      },
    ],
  };

  const next = predictionStore.removePredictionMatchAndVotes(state, "match-test");

  assert.deepEqual(
    next.matches.map((match) => match.id),
    ["match-keep"]
  );
  assert.deepEqual(
    next.votes.map((vote) => vote.match_id),
    ["match-keep"]
  );
  assert.throws(
    () => predictionStore.removePredictionMatchAndVotes(state, "missing-match"),
    /prediction_match_not_found/
  );
});

test("derivePredictionMatchStatus handles open, warning, closed, and published states", () => {
  const now = new Date("2026-05-05T12:00:00.000Z");

  assert.equal(
    predictionStore.derivePredictionMatchStatus(
      { start_at: "2026-05-05T15:00:00.000Z", close_at: "2026-05-05T14:30:00.000Z", status: "open" },
      now
    ),
    "open"
  );

  assert.equal(
    predictionStore.derivePredictionMatchStatus(
      { start_at: "2026-05-05T12:40:00.000Z", close_at: "2026-05-05T12:10:00.000Z", status: "open" },
      now
    ),
    "closing_soon"
  );

  assert.equal(
    predictionStore.derivePredictionMatchStatus(
      { start_at: "2026-05-05T12:20:00.000Z", close_at: "2026-05-05T11:50:00.000Z", status: "open" },
      now
    ),
    "closed"
  );

  assert.equal(
    predictionStore.derivePredictionMatchStatus(
      {
        start_at: "2026-05-05T12:20:00.000Z",
        close_at: "2026-05-05T11:50:00.000Z",
        status: "closed",
        result_team_code: "team-a",
        result_published_at: "2026-05-05T12:05:00.000Z",
      },
      now
    ),
    "result_published"
  );
});

test("validatePredictionVote rejects closed matches and invalid team picks", () => {
  const match = {
    id: "match-1",
    team_a_code: "team-a",
    team_b_code: "team-b",
    start_at: "2026-05-05T12:00:00.000Z",
    close_at: "2026-05-05T11:30:00.000Z",
    status: "open",
  };

  assert.throws(
    () =>
      predictionStore.validatePredictionVote(
        {
          voterId: "voter-1",
          match,
          pickedTeamCode: "team-a",
          existingVote: null,
          now: new Date("2026-05-05T11:31:00.000Z"),
        }
      ),
    /prediction_vote_closed/
  );

  assert.throws(
    () =>
      predictionStore.validatePredictionVote(
        {
          voterId: "voter-1",
          match: { ...match, close_at: "2026-05-05T11:40:00.000Z" },
          pickedTeamCode: "team-c",
          existingVote: null,
          now: new Date("2026-05-05T11:20:00.000Z"),
        }
      ),
    /invalid_team_pick/
  );
});

test("validatePredictionVote rejects players outside the admin-selected roster", () => {
  const match = {
    id: "match-1",
    team_a_code: "team-a",
    team_b_code: "team-b",
    team_a_player_ids: ["player-a"],
    team_b_player_ids: ["player-b"],
    start_at: "2026-05-05T12:00:00.000Z",
    close_at: "2026-05-05T11:40:00.000Z",
    status: "open",
  };

  assert.doesNotThrow(() =>
    predictionStore.validatePredictionVote({
      voterId: "voter-1",
      match,
      pickedPlayerId: "player-a",
      existingVote: null,
      now: new Date("2026-05-05T11:20:00.000Z"),
    })
  );

  assert.throws(
    () =>
      predictionStore.validatePredictionVote({
        voterId: "voter-1",
        match,
        pickedPlayerId: "player-c",
        existingVote: null,
        now: new Date("2026-05-05T11:20:00.000Z"),
      }),
    /invalid_player_pick/
  );
});

test("validatePredictionMatchForSave rejects duplicated players in the same prediction", () => {
  const baseMatch = {
    id: "match-1",
    team_a_code: "team-a",
    team_b_code: "team-b",
    start_at: "2026-05-05T12:00:00.000Z",
    close_at: "2026-05-05T11:40:00.000Z",
    status: "open",
  };

  assert.throws(
    () =>
      predictionStore.validatePredictionMatchForSave({
        ...baseMatch,
        team_a_player_ids: ["player-a", "player-a"],
        team_b_player_ids: ["player-b"],
      }),
    /duplicate_prediction_player/
  );

  assert.throws(
    () =>
      predictionStore.validatePredictionMatchForSave({
        ...baseMatch,
        team_a_player_ids: ["player-a"],
        team_b_player_ids: ["player-a"],
      }),
    /duplicate_prediction_player/
  );

  assert.doesNotThrow(() =>
    predictionStore.validatePredictionMatchForSave({
      ...baseMatch,
      team_a_player_ids: ["player-a"],
      team_b_player_ids: ["player-b"],
    })
  );
});

test("validatePredictionVote allows exactly one changed prediction before close", () => {
  const match = {
    id: "match-1",
    team_a_code: "team-a",
    team_b_code: "team-b",
    start_at: "2026-05-05T12:00:00.000Z",
    close_at: "2026-05-05T11:40:00.000Z",
    status: "open",
  };

  const firstChange = predictionStore.validatePredictionVote({
    voterId: "voter-1",
    match,
    pickedTeamCode: "team-b",
    existingVote: {
      voter_id: "voter-1",
      match_id: "match-1",
      picked_team_code: "team-a",
      change_count: 0,
      updated_at: "2026-05-05T11:00:00.000Z",
    },
    now: new Date("2026-05-05T11:20:00.000Z"),
    enforceChangeLimit: true,
  });

  assert.equal(firstChange.change_count, 1);

  assert.throws(
    () =>
      predictionStore.validatePredictionVote({
        voterId: "voter-1",
        match,
        pickedTeamCode: "team-a",
        existingVote: {
          voter_id: "voter-1",
          match_id: "match-1",
          picked_team_code: "team-b",
          change_count: 1,
          updated_at: "2026-05-05T11:10:00.000Z",
        },
        now: new Date("2026-05-05T11:20:00.000Z"),
        enforceChangeLimit: true,
      }),
    /prediction_change_limit_reached/
  );
});

test("buildTournamentPredictionMatches uses admin-selected player lists", () => {
  const teamAPlayer = {
    id: "bd78f78a-3bea-441d-9999-f0070e332103",
    name: "Team A Selected",
    race: "T",
    tier: "S",
    university: "Team A",
    photo_url: null,
    broadcast_title: null,
    broadcast_url: null,
    created_at: null,
    detailed_stats: null,
    elo_point: null,
    eloboard_id: null,
    is_live: false,
    last_synced_at: null,
    live_thumbnail_url: null,
    match_history: null,
    nickname: null,
    soop_id: null,
    tier_rank: null,
    total_losses: null,
    total_wins: null,
    win_rate: null,
    gender: null,
    last_checked_at: null,
    last_match_at: null,
    last_changed_at: null,
    check_priority: null,
    check_interval_days: null,
  };
  const teamAHidden = { ...teamAPlayer, id: "43593f14-05aa-449e-bea7-ec487ed72068", name: "Team A Hidden" };
  const teamBPlayer = { ...teamAPlayer, id: "c402cbde-0c6d-454d-8083-3083d7974556", name: "Team B Selected", university: "Team B" };
  const teamBHidden = { ...teamAPlayer, id: "8c279233-3f53-4a2f-b0ac-7d4c48e34156", name: "Team B Hidden", university: "Team B" };
  const teamBHidden2 = { ...teamAPlayer, id: "5aee11bf-9641-4056-8290-8c4cae1efa49", name: "Team B Hidden 2", university: "Team B" };

  const matches = tournamentPrediction.buildTournamentPredictionMatches(
    [teamAHidden, teamAPlayer, teamBHidden, teamBHidden2, teamBPlayer],
    {
      matches: [
        {
          id: "match-selected",
          team_a_code: "t1",
          team_b_code: "t2",
          team_a_player_ids: [teamAPlayer.id],
          team_b_player_ids: [teamBPlayer.id],
          start_at: "2026-05-05T13:00:00.000Z",
          close_at: "2026-05-05T12:30:00.000Z",
          status: "open",
        },
      ],
      votes: [
        {
          voter_id: "soop:user-1",
          match_id: "match-selected",
          picked_player_id: teamBHidden.id,
          updated_at: "2026-05-05T12:00:00.000Z",
        },
      ],
    }
  );

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].teamA.players.map((player) => player.id), [teamAPlayer.id]);
  assert.deepEqual(matches[0].teamB.players.map((player) => player.id), [teamBPlayer.id]);
  assert.deepEqual(Object.keys(matches[0].mvpVotes), [teamAPlayer.id, teamBPlayer.id]);
});

test("buildTournamentPredictionMatches supports direct event teams and entry matchup guidance", () => {
  const playerA = {
    id: "bd78f78a-3bea-441d-9999-f0070e332103",
    name: "박하악",
    race: "Protoss",
    tier: "5",
    university: "A",
    photo_url: null,
    broadcast_title: null,
    broadcast_url: null,
    created_at: null,
    detailed_stats: null,
    elo_point: null,
    eloboard_id: null,
    is_live: false,
    last_synced_at: null,
    live_thumbnail_url: null,
    match_history: null,
    nickname: null,
    soop_id: null,
    tier_rank: null,
    total_losses: null,
    total_wins: null,
    win_rate: null,
    gender: null,
    last_checked_at: null,
    last_match_at: null,
    last_changed_at: null,
    check_priority: null,
    check_interval_days: null,
  };
  const playerB = {
    ...playerA,
    id: "c402cbde-0c6d-454d-8083-3083d7974556",
    name: "김지성",
    race: "Zerg",
    tier: "3",
    university: "B",
  };

  const matches = tournamentPrediction.buildTournamentPredictionMatches([playerA, playerB], {
    matches: [
      {
        id: "match-direct",
        match_type: "team",
        team_mode: "direct",
        team_a_code: "event-a",
        team_b_code: "event-b",
        team_a_name: "철구팀",
        team_b_name: "봉준팀",
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        entry_order_status: "unknown",
        entry_matchups: [{ player_a_id: playerA.id, player_b_id: playerB.id }],
        start_at: "2026-05-05T13:00:00.000Z",
        close_at: "2026-05-05T12:30:00.000Z",
        status: "open",
      },
    ],
    votes: [],
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchType, "team");
  assert.equal(matches[0].teamMode, "direct");
  assert.equal(matches[0].teamA.teamName, "철구팀");
  assert.equal(matches[0].teamB.teamName, "봉준팀");
  assert.deepEqual(matches[0].teamA.players.map((player) => player.id), [playerA.id]);
  assert.deepEqual(matches[0].teamB.players.map((player) => player.id), [playerB.id]);
  assert.equal(matches[0].entryOrderStatus, "unknown");
  assert.deepEqual(matches[0].entryMatchups.map((row) => row.label), ["매치1"]);
  assert.equal(matches[0].entryMatchups[0].playerA?.name, "박하악");
  assert.equal(matches[0].entryMatchups[0].playerB?.name, "김지성");
});

test("buildTournamentPredictionMatches supports individual winner predictions", () => {
  const playerA = {
    id: "bd78f78a-3bea-441d-9999-f0070e332103",
    name: "김지성",
    race: "Zerg",
    tier: "3",
    university: "A",
    photo_url: null,
    broadcast_title: null,
    broadcast_url: null,
    created_at: null,
    detailed_stats: null,
    elo_point: null,
    eloboard_id: null,
    is_live: false,
    last_synced_at: null,
    live_thumbnail_url: null,
    match_history: null,
    nickname: null,
    soop_id: null,
    tier_rank: null,
    total_losses: null,
    total_wins: null,
    win_rate: null,
    gender: null,
    last_checked_at: null,
    last_match_at: null,
    last_changed_at: null,
    check_priority: null,
    check_interval_days: null,
  };
  const playerB = {
    ...playerA,
    id: "c402cbde-0c6d-454d-8083-3083d7974556",
    name: "박하악",
    race: "Protoss",
    tier: "5",
    university: "B",
  };

  const matches = tournamentPrediction.buildTournamentPredictionMatches([playerA, playerB], {
    matches: [
      {
        id: "match-individual",
        match_type: "individual",
        team_a_code: `player:${playerA.id}`,
        team_b_code: `player:${playerB.id}`,
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        title: "중장전 1경기",
        start_at: "2026-05-05T13:00:00.000Z",
        close_at: "2026-05-05T12:30:00.000Z",
        status: "open",
      },
    ],
    votes: [],
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchType, "individual");
  assert.equal(matches[0].title, "중장전 1경기");
  assert.equal(matches[0].teamA.teamName, "김지성");
  assert.equal(matches[0].teamB.teamName, "박하악");
  assert.deepEqual(matches[0].entryMatchups, []);
});

test("prediction match snapshots preserve a start time TBD flag", () => {
  const playerA = makePredictionPlayer({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Player A",
  });
  const playerB = makePredictionPlayer({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Player B",
  });

  const [match] = tournamentPrediction.buildTournamentPredictionMatches([playerA, playerB], {
    matches: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        match_type: "individual",
        team_a_player_ids: [playerA.id],
        team_b_player_ids: [playerB.id],
        team_a_code: `player:${playerA.id}`,
        team_b_code: `player:${playerB.id}`,
        start_at: "2026-05-24T11:00:00.000Z",
        close_at: "2026-05-24T10:30:00.000Z",
        status: "open",
        start_time_tbd: true,
      },
    ],
    votes: [],
  });

  assert.equal(match.startTimeTbd, true);
});

test("prediction writes fail closed on Vercel without Supabase admin env", () => {
  assert.throws(
    () =>
      predictionStore.assertPredictionWriteAllowed({
        hasRemoteEnv: false,
        isVercelDeployment: true,
      }),
    /prediction_supabase_required/
  );

  assert.equal(
    predictionStore.assertPredictionWriteAllowed({
      hasRemoteEnv: false,
      isVercelDeployment: false,
    }),
    true
  );
});

test("remote prediction vote validation scopes Supabase reads to the target voter and match", () => {
  const source = fs.readFileSync(path.join(repoRoot, "lib", "prediction-store.ts"), "utf8");

  assert.match(source, /type PredictionStateLoadOptions = \{/);
  assert.match(source, /voteMatchIds\?: string\[\]/);
  assert.match(source, /voterId\?: string/);
  assert.match(source, /\.in\("id", matchIds\)/);
  assert.match(source, /\.in\("match_id", voteMatchIds\)/);
  assert.match(source, /\.eq\("voter_id", voterId\)/);
  assert.match(source, /loadPredictionState\(\{\s*matchIds: \[matchId\],\s*voteMatchIds: \[matchId\],\s*voterId: normalizeText\(input\.voterId\),/s);
});
