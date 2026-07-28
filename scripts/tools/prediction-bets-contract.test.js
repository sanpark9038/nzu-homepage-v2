const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** 프로젝트 TS를 그대로 트랜스파일해 실제 로직을 돌린다 (jungman-standings.test.js와 같은 방식). */
function loadModule(relativePath) {
  const compiled = ts.transpileModule(readProjectFile(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, () => ({}));
  return mod.exports;
}

const { computeBetSettlement, BET_MIN, BET_STEP, BET_MAX } = loadModule("lib/prediction-bets.ts");

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
    process.exitCode = 1;
  }
}

function bet(teamCode, stake) {
  return { team_code: teamCode, stake };
}

test("파리뮤추얼: 승자는 원금 + 패자풀 지분을 받고, 지급 합계는 총풀을 넘지 않는다", () => {
  const bets = [bet("A", 100), bet("A", 200), bet("B", 100)];
  const settled = computeBetSettlement(bets, "A");

  // 승자풀 300, 패자풀 100 → floor 로 33 / 66 만 나가고 1P 는 소멸
  assert.deepEqual(
    settled.map((row) => [row.status, row.payout]),
    [
      ["won", 133],
      ["won", 266],
      ["lost", 0],
    ]
  );

  const totalPool = bets.reduce((sum, row) => sum + row.stake, 0);
  const paid = settled.reduce((sum, row) => sum + row.payout, 0);
  assert.ok(paid <= totalPool, `지급 합계(${paid})가 총풀(${totalPool})을 넘으면 포인트가 창조된다`);
});

test("패자풀이 0이면 전원 원금 환급", () => {
  const settled = computeBetSettlement([bet("A", 500), bet("A", 100)], "A");
  assert.deepEqual(
    settled.map((row) => [row.status, row.payout]),
    [
      ["won", 500],
      ["won", 100],
    ]
  );
});

test("승자가 없으면 전원 lost (배당 없음)", () => {
  const settled = computeBetSettlement([bet("A", 100), bet("B", 200)], "C");
  assert.deepEqual(
    settled.map((row) => row.status),
    ["lost", "lost"]
  );
  assert.equal(
    settled.reduce((sum, row) => sum + row.payout, 0),
    0
  );

  const noResult = computeBetSettlement([bet("A", 100)], null);
  assert.equal(noResult[0].status, "lost");
});

test("베팅 하나뿐이어도(상대 없음) 원금만 돌려준다", () => {
  const settled = computeBetSettlement([bet("A", 1000)], "A");
  assert.deepEqual(settled[0], { bet: { team_code: "A", stake: 1000 }, status: "won", payout: 1000 });
});

test("스테이크 범위 상수는 100 단위", () => {
  assert.equal(BET_MIN, 100);
  assert.equal(BET_STEP, 100);
  assert.equal(BET_MAX, 5000);
});

test("스키마: 경기당 1회 유니크, 양수 스테이크, 경기 삭제 시 cascade, RLS 잠금", () => {
  const sql = readProjectFile("scripts/sql/create-prediction-bets.sql");

  assert.match(sql, /unique\s*\(\s*voter_id\s*,\s*match_id\s*\)/);
  assert.match(sql, /stake integer not null check \(stake > 0\)/);
  assert.match(sql, /check \(status in \('placed', 'won', 'lost', 'refunded'\)\)/);
  assert.match(sql, /references public\.prediction_matches\(id\) on delete cascade/);
  assert.match(sql, /create index if not exists prediction_bets_match_id_idx/);
  assert.match(sql, /alter table public\.prediction_bets enable row level security/);
  // 정책 없이 RLS만 = service role 전용. 정책이 생기면 남의 베팅이 새어나간다
  assert.doesNotMatch(sql, /create policy/i);
});

test("풀 집계 RPC 는 미정산 베팅만 세고 voter_id 를 내보내지 않는다", () => {
  const sql = readProjectFile("scripts/sql/create-prediction-bets.sql");

  assert.match(sql, /create or replace function public\.prediction_bet_pools\(match_ids uuid\[\] default null\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /where b\.status = 'placed'/);
  assert.match(sql, /grant execute on function public\.prediction_bet_pools\(uuid\[\]\) to anon, authenticated, service_role;/);

  const returnsBlock = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
  assert.doesNotMatch(returnsBlock, /voter_id/, "공개 집계에 voter_id 컬럼이 들어가면 안 된다");
});

test("공개 payload 에 voter_id 가 실리지 않는다", () => {
  const source = readProjectFile("lib/prediction-bets.ts");
  const poolsStart = source.indexOf("export async function getBetPools");
  const poolsEnd = source.indexOf("export async function getMyBets");
  assert.notEqual(poolsStart, -1);
  assert.ok(poolsEnd > poolsStart);

  assert.doesNotMatch(source.slice(poolsStart, poolsEnd), /voter_id/);
  // 내 베팅 조회도 필요한 컬럼만 — voter_id 는 필터에만 쓰고 응답에는 담지 않는다
  assert.match(source, /\.select\("match_id, team_code, stake, status, payout"\)/);

  const clientSource = readProjectFile("components/prediction/TournamentPredictionClient.tsx");
  assert.doesNotMatch(clientSource, /voterId|voter_id/);
});

test("정산은 저장 뒤 · revalidate 앞에서 돌고, 강제 삭제는 환불 뒤에 지운다", () => {
  const source = readProjectFile("app/api/admin/prediction/route.ts");

  const snapshotIndex = source.indexOf("const resultsBefore = await readMatchResultSnapshot();");
  const saveIndex = source.indexOf("await savePredictionMatches(matches);");
  const settleIndex = source.indexOf("await settleNewlyPublishedMatches(");
  const revalidateIndex = source.indexOf("revalidatePredictionPublicViews();");

  assert.ok(snapshotIndex > -1 && saveIndex > snapshotIndex, "저장 전 결과 스냅샷을 떠야 delta 를 알 수 있다");
  assert.ok(settleIndex > saveIndex, "정산은 저장 뒤에");
  assert.ok(revalidateIndex > settleIndex, "정산 뒤에 revalidate");

  const refundIndex = source.indexOf("await refundBetsForMatch(matchId);");
  const forceDeleteIndex = source.indexOf("await deletePredictionMatchWithVotes(matchId);");
  assert.ok(refundIndex > -1 && forceDeleteIndex > refundIndex, "cascade 로 지워지기 전에 환불해야 한다");
});

test("정산은 단방향이라는 사실이 코드에 남아있다", () => {
  const source = readProjectFile("lib/prediction-bets.ts");
  assert.match(source, /ponytail: 정산은 단방향/);
  // 지급 멱등 키 = (voter_id, 'bet_payout', match_id)
  assert.match(source, /"bet_payout", matchId/);
  assert.match(source, /"bet_place", matchId/);
  assert.match(source, /"bet_refund", matchId/);
});

test("포인트 이동은 원장 RPC 한 문으로만 들어간다", () => {
  const points = readProjectFile("lib/points.ts");
  const bets = readProjectFile("lib/prediction-bets.ts");

  assert.match(points, /export async function applyPointChange\(/);
  assert.match(bets, /import \{ applyPointChange, readBalance \} from "@\/lib\/points";/);
  // 베팅이 잔액 테이블을 직접 건드리면 원장과 어긋난다
  assert.doesNotMatch(bets, /from\("user_point_balances"\)/);
  assert.doesNotMatch(bets, /from\("user_point_ledger"\)/);
});

test("테이블이 없어도(PGRST205) 조용히 no-op", () => {
  const source = readProjectFile("lib/prediction-bets.ts");
  assert.match(source, /PGRST205/);
  assert.match(source, /PGRST202/);
  assert.match(source, /if \(isMissingTable\(error\)\) return \[\];/);
});

if (failed === 0) console.log("\nprediction-bets contract OK");
