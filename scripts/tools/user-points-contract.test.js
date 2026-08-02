const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("point ledger schema enforces idempotency, non-negative balance and RLS lockdown", () => {
  const sql = readProjectFile("scripts/sql/create-user-points.sql");

  // 멱등성의 핵심 — 출석 재클릭·베팅 재전송이 원장에 두 번 남지 않는다
  assert.match(sql, /unique\s*\(\s*voter_id\s*,\s*reason\s*,\s*ref_id\s*\)/);
  assert.match(sql, /balance integer not null default 0 check \(balance >= 0\)/);

  assert.match(sql, /alter table public\.user_point_balances enable row level security/);
  assert.match(sql, /alter table public\.user_point_ledger enable row level security/);
  // 정책 없이 RLS만 = service role 전용. 공개 select 정책이 생기면 원장 voter_id가 새어나간다
  assert.doesNotMatch(sql, /create policy/i);

  assert.match(sql, /reason text not null check \(reason in \([^)]*'bet_place'[^)]*\)\)/);
});

test("point mutation RPC is one transaction, distinguishes duplicates, and is service_role only", () => {
  const sql = readProjectFile("scripts/sql/create-user-points.sql");

  assert.match(
    sql,
    /create or replace function public\.apply_user_point_change\(\s*p_voter_id text,\s*p_display_name text,\s*p_amount integer,\s*p_reason text,\s*p_ref_id text\s*\) returns integer/
  );
  assert.match(sql, /exception when unique_violation then\s*raise exception 'user_point_duplicate'/);
  // update-먼저 방식이어야 한다. upsert(on conflict)는 check(balance >= 0)가 병합 결과가 아니라
  // 삽입 시도값에 먼저 걸려 음수 차감(베팅)이 잔액과 무관하게 실패한다 — 실제로 겪은 버그.
  assert.match(sql, /update public\.user_point_balances\s*set balance = balance \+ p_amount/);
  assert.match(sql, /if not found then[\s\S]*insert into public\.user_point_balances/);
  assert.doesNotMatch(sql, /on conflict \(voter_id\) do update/);
  assert.match(sql, /revoke all on function public\.apply_user_point_change[\s\S]*from public;/);
  assert.match(sql, /grant execute on function public\.apply_user_point_change[\s\S]*to service_role;/);
  assert.doesNotMatch(sql, /security definer/i);
});

test("attendance day key rolls over at KST midnight, not UTC midnight", () => {
  const source = readProjectFile("lib/points.ts");
  assert.match(source, /new Intl\.DateTimeFormat\("en-CA", \{\s*timeZone: "Asia\/Seoul"/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0, 10\)/);

  // 계약 확인: UTC 15:00 = KST 다음 날 00:00 → 날짜키가 넘어가야 한다
  const format = (iso) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));

  assert.equal(format("2026-07-28T14:59:59Z"), "2026-07-28");
  assert.equal(format("2026-07-28T15:00:00Z"), "2026-07-29");
  assert.equal(format("2026-07-29T14:59:59Z"), "2026-07-29");
});

test("attendance is idempotent per KST day and grants the signup bonus only once", () => {
  const source = readProjectFile("lib/points.ts");

  assert.match(source, /export const SIGNUP_BONUS = 1000;/);
  assert.match(source, /export const ATTENDANCE_REWARD = 100;/);
  // 출석 ref_id = 오늘 날짜키, 가입 보너스 ref_id = 'signup'
  assert.match(source, /"signup_bonus",\s*"signup"/);
  assert.match(source, /"attendance",\s*\n?\s*getKstDateKey\(\)/);
  // 중복은 실패가 아니라 alreadyClaimed
  assert.match(source, /if \(!isDuplicate\(error\)\) throw error;\s*\n\s*return \{ ok: true, alreadyClaimed: true/);
});

test("public leaderboard never exposes voter_id", () => {
  const source = readProjectFile("lib/points.ts");

  const start = source.indexOf("export async function getLeaderboard");
  assert.notEqual(start, -1);
  const body = source.slice(start);

  assert.match(body, /\.select\("display_name, balance"\)/);
  assert.doesNotMatch(body, /voter_id/);
  assert.match(body, /rank: index \+ 1/);

  const clientSource = readProjectFile("components/points/PointsClient.tsx");
  assert.doesNotMatch(clientSource, /voterId|voter_id/);
});

test("points API refuses attendance without a session and never caches per-user reads", () => {
  const attendanceRoute = readProjectFile("app/api/points/attendance/route.ts");

  assert.match(attendanceRoute, /parsePublicAuthSessionCookieValue\(cookieStore\.get\(PUBLIC_AUTH_SESSION_COOKIE\)\?\.value\)/);
  assert.match(
    attendanceRoute,
    /if \(!session\) \{\s*return NextResponse\.json\(\{ ok: false, message: "points_login_required" \}, \{ status: 401 \}\);/
  );

  const listRoute = readProjectFile("app/api/points/route.ts");
  assert.match(listRoute, /export const dynamic = "force-dynamic";/);
  assert.match(attendanceRoute, /export const dynamic = "force-dynamic";/);
});

test("points page keeps the cookie read on the client so the shell stays cacheable", () => {
  const pageSource = readProjectFile("app/points/page.tsx");

  assert.doesNotMatch(pageSource, /cookies\(\)/);
  assert.doesNotMatch(pageSource, /@\/lib\/points/);
  assert.match(pageSource, /<PointsClient \/>/);

  const clientSource = readProjectFile("components/points/PointsClient.tsx");
  assert.match(clientSource, /^"use client";/);
  assert.match(clientSource, /fetch\("\/api\/points", \{ cache: "no-store" \}\)/);
  // 서버 전용 모듈은 타입만 가져와야 한다 (값 import는 service key를 번들에 끌어들인다)
  assert.match(clientSource, /import type \{[^}]*\} from "@\/lib\/points";/);
  assert.doesNotMatch(clientSource, /^import \{[^}]*\} from "@\/lib\/points";/m);
});

test("missing table degrades to an empty read instead of a 500", () => {
  const source = readProjectFile("lib/points.ts");

  assert.match(source, /PGRST205/);
  assert.match(source, /user_points 테이블이 없습니다/);
  assert.match(source, /return \{ balance: 0, attendedToday: false, ledger: \[\] \};/);
});
