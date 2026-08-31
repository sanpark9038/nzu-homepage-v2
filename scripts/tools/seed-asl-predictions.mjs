/**
 * 주간 승부예측 시딩 — 그 주(D-7 이내)에 열리는 ASL 24강과 K-중만컵 경기를 한꺼번에 등록한다.
 * (파일 이름은 ASL 시절 그대로다. npm run seed:asl-predictions가 이 파일이다.)
 *
 * 기본은 드라이런 — 등록될 행을 표로 보여주기만 한다. `--apply`가 있어야 실제 insert.
 * 선수 이름·날짜는 여기 다시 적지 않는다. ASL은 lib/asl.ts, 중만컵은 site_settings KV 한 벌에서만 온다 —
 * 두 벌로 적으면 편성이 바뀌었을 때 화면과 예측이 조용히 어긋난다.
 *
 *   node scripts/tools/seed-asl-predictions.mjs            (드라이런)
 *   node scripts/tools/seed-asl-predictions.mjs --apply    (실제 등록)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

dotenv.config({ path: path.join(ROOT, ".env.local") });

/** 프로젝트 TS를 그대로 트랜스파일해 실제 값을 읽는다 (asl.test.js와 같은 방식). */
function loadModule(relativePath, resolve = () => ({})) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(ROOT, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, resolve);
  return mod.exports;
}

// lib/asl.ts는 날짜를 lib/jungman.ts의 ASL_SCHEDULE에서 가져온다 — 진짜 모듈을 물려준다.
const jungman = loadModule("lib/jungman.ts");
const { ASL_GROUPS, ASL_MATCH_TIME, ASL_SEASON } = loadModule("lib/asl.ts", (id) =>
  id === "./jungman" ? jungman : {}
);
const { JUNGMAN_MATCH_TIME } = jungman;
const { JUNGMAN_STANDINGS_KEY, parseJungmanStandings, upcomingJungmanMatches } =
  loadModule("lib/jungman-standings.ts", (id) => (id === "@/lib/jungman" ? jungman : {}));
// 팀 이름 -> 팀 코드. 이름 표기를 여기 다시 적지 않는다 — 사이트가 쓰는 그 지도를 그대로 쓴다
const { UNIVERSITY_ALIAS_MAP } = loadModule("lib/university-config.ts");

/** 당일 오후 6시 마감 — 방송(19:00) 1시간 전 (사용자 지정) */
const CLOSE_TIME = "18:00";

/**
 * 방송 D-7 이내만 등록한다 — 3주치를 한꺼번에 열면 마감 임박 경기가 먼 경기들 사이에 묻히고,
 * 먼 경기 예측은 정보 없이 찍기라 재미도 없다. 매주 한 번 다시 돌리면 그 주 방송분이 열린다.
 */
const OPEN_WINDOW_DAYS = 7;

/** en-CA는 "YYYY-MM-DD"로 뱉는다 — 문자열 비교·Date.parse 둘 다 되는 유일한 로캘 */
const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TODAY_KST = KST_DATE.format(new Date());

/** 방송일까지 남은 날 (한국 날짜 기준) */
function daysUntil(date) {
  return Math.round((Date.parse(date) - Date.parse(TODAY_KST)) / 86_400_000);
}

/**
 * 명단 순서가 대진이다: players[0] vs players[1] = 1경기, players[2] vs players[3] = 2경기.
 * display_order는 조 순서×10 + 경기번호 (A조1=11 … F조2=62).
 */
function buildAslRows(displayOrderOffset = 0) {
  return ASL_GROUPS.flatMap((group, groupIndex) =>
    [1, 2].map((no) => {
      const [a, b] = group.players.slice((no - 1) * 2, no * 2);
      const code = `asl24-${String.fromCharCode(97 + groupIndex)}${no}`;
      return {
        title: `${ASL_SEASON} 24강 ${group.name} ${no}경기`,
        match_type: "team",
        // 선수DB에 없는 이름을 쓰는 공식 경로 — 어드민 "팀 직접입력"과 같다
        team_mode: "direct",
        team_a_code: `${code}-a`,
        team_a_name: a.name,
        team_b_code: `${code}-b`,
        team_b_name: b.name,
        team_a_player_ids: [],
        team_b_player_ids: [],
        entry_order_status: "confirmed",
        entry_matchups: [],
        start_at: `${group.date}T${ASL_MATCH_TIME}:00+09:00`,
        start_time_tbd: false,
        close_at: `${group.date}T${CLOSE_TIME}:00+09:00`,
        // 마감·오픈은 close_at 기준으로 화면이 알아서 계산한다
        status: "open",
        result_team_code: null,
        result_published_at: null,
        display_order: (groupIndex + 1) * 10 + no + displayOrderOffset,
      };
    })
  );
}

/**
 * 중만컵 예정 경기 → 예측 행. 아직 안 끝났고 날짜가 있는 경기만 온다(upcomingJungmanMatches).
 * 그중 D-7 밖은 표에만 "아직 멀음"으로 찍히고 등록은 안 된다 — ASL과 같은 규칙이다.
 */
function buildJungmanRows(standings, displayOrderOffset) {
  if (!standings) return [];
  return upcomingJungmanMatches(standings.matches).map((match, index) => {
    const code = `jm-${match.date}-${index}`;
    // 중만컵은 우리 팀들이라 "기존 팀 사용"으로 건다 — 로고와 선수 명단이 따라붙는다.
    // 다만 둘 중 하나라도 코드를 못 찾으면 통째로 직접입력으로 물러난다: 기존 팀 모드에서
    // 코드가 안 맞으면 그 경기가 화면에서 조용히 사라진다(빈 칸이 아니라 아예 없어진다).
    const homeCode = UNIVERSITY_ALIAS_MAP[match.home];
    const awayCode = UNIVERSITY_ALIAS_MAP[match.away];
    const existing = Boolean(homeCode && awayCode);
    return {
      title: `K-중만컵 ${match.group} ${match.home} vs ${match.away}`,
      match_type: "team",
      team_mode: existing ? "existing" : "direct",
      team_a_code: existing ? homeCode : `${code}-a`,
      team_a_name: match.home,
      team_b_code: existing ? awayCode : `${code}-b`,
      team_b_name: match.away,
      team_a_player_ids: [],
      team_b_player_ids: [],
      entry_order_status: "confirmed",
      entry_matchups: [],
      start_at: `${match.date}T${JUNGMAN_MATCH_TIME}:00+09:00`,
      start_time_tbd: false,
      close_at: `${match.date}T${CLOSE_TIME}:00+09:00`,
      status: "open",
      result_team_code: null,
      result_published_at: null,
      display_order: displayOrderOffset + index + 1,
    };
  });
}

/**
 * 중복 판정 열쇠 — "한국 날짜 + 팀 이름 쌍(순서 무관)".
 * 제목만으로는 부족하다: 관리자가 손으로 만든 예측은 제목 형식이 우리와 다르다.
 * 이름이 한쪽이라도 비면 판정을 포기한다(null) — 빈 이름끼리 같다고 보면 엉뚱한 경기가 묶인다.
 */
function pairKey(startAt, teamA, teamB) {
  const a = (teamA ?? "").trim();
  const b = (teamB ?? "").trim();
  if (!startAt || !a || !b) return null;
  const day = KST_DATE.format(new Date(startAt));
  return `${day}|${[a, b].sort().join(" vs ")}`;
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error(
      ".env.local에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 있어야 한다."
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const apply = process.argv.includes("--apply");

/**
 * --until YYYY-MM-DD: 그 날짜(포함)까지의 경기만 등록한다.
 * D-7 창 안이라도 더 좁게 자르고 싶을 때 쓴다 — 없으면 창 전체.
 */
const untilIndex = process.argv.indexOf("--until");
const until = untilIndex >= 0 ? process.argv[untilIndex + 1] : null;
if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
  console.error(`--until 값이 날짜가 아니다: ${until} (예: --until 2026-08-09)`);
  process.exit(1);
}
const db = supabase();

// 기존 경기를 읽어 (1) 재등록 방지(제목 + 날짜·팀이름쌍) (2) display_order 충돌 방지
const { data: existing, error } = await db
  .from("prediction_matches")
  .select("title, display_order, start_at, team_a_name, team_b_name")
  .is("archived_at", null);
if (error) {
  console.error(`기존 경기를 읽지 못했다: ${error.message}`);
  process.exit(1);
}

/**
 * 중만컵 일정은 site_settings 한 칸이 원본이다(관리자가 손으로 넣는 JSON).
 * 못 읽거나 비어 있으면 중만컵만 건너뛴다 — ASL 시딩까지 같이 죽이지 않는다.
 */
const { data: settingRow, error: settingError } = await db
  .from("site_settings")
  .select("value")
  .eq("key", JUNGMAN_STANDINGS_KEY)
  .maybeSingle();
if (settingError) {
  console.warn(`중만컵 일정을 읽지 못했다 (${settingError.message}) — ASL만 처리한다.\n`);
}
const standings = settingError ? null : parseJungmanStandings(settingRow?.value);
if (!settingError && !standings) {
  console.warn(`중만컵 일정이 비어 있다 (site_settings.${JUNGMAN_STANDINGS_KEY}) — ASL만 처리한다.\n`);
}

const takenTitles = new Set(existing.map((row) => row.title));
const takenPairs = new Set(
  existing.map((row) => pairKey(row.start_at, row.team_a_name, row.team_b_name)).filter(Boolean)
);
const maxOrder = existing.reduce((max, row) => Math.max(max, row.display_order ?? 0), 0);

/** 대회를 붙여 다닌다 — 요약에서 ASL·중만컵을 나눠 세야 한다 */
const entries = [
  ...buildAslRows(maxOrder).map((row) => ({ row, cup: "ASL" })),
  // ASL 최대치(maxOrder+62)와 안 겹치게 100 띄운다
  ...buildJungmanRows(standings, maxOrder + 100).map((row) => ({ row, cup: "중만컵" })),
];

/** 지난 경기는 등록하지 않는다 — 마감이 이미 지난 예측은 열 이유가 없다 */
function rowState(row) {
  if (takenTitles.has(row.title)) return "이미 있음";
  // 제목이 우리 형식과 달라도(관리자가 손으로 만든 예측) 같은 날 같은 대진이면 이미 있는 것이다
  if (takenPairs.has(pairKey(row.start_at, row.team_a_name, row.team_b_name))) return "이미 있음";
  const day = row.close_at.slice(0, 10);
  const days = daysUntil(day);
  if (days < 0) return "지남";
  if (days > OPEN_WINDOW_DAYS) return `아직 멀음(D-${days})`;
  if (until && day > until) return "보류(--until 밖)";
  return "신규";
}

for (const entry of entries) entry.state = rowState(entry.row);

console.log(`주간 승부예측 시딩 — 후보 ${entries.length}건 (기존 ${existing.length}건)\n`);
console.log("  제목                                       마감(KST)         순서  상태");
console.log("  " + "-".repeat(84));
for (const { row, state } of entries) {
  console.log(
    "  " +
      [
        row.title.padEnd(42),
        row.close_at.slice(0, 16).replace("T", " ").padEnd(17),
        String(row.display_order).padEnd(5),
        state,
      ].join(" ")
  );
}

const count = (test) => entries.filter(test).length;
const fresh = entries.filter((e) => e.state === "신규");
console.log(
  `\n신규 ${fresh.length}건 (ASL ${count((e) => e.state === "신규" && e.cup === "ASL")}·중만컵 ${count(
    (e) => e.state === "신규" && e.cup === "중만컵"
  )}) · 이미 있음 ${count((e) => e.state === "이미 있음")} · 아직 멀음 ${count((e) =>
    e.state.startsWith("아직 멀음")
  )} · 보류 ${count((e) => e.state.startsWith("보류"))} · 지남 ${count((e) => e.state === "지남")}`
);

if (!apply) {
  console.log("\n드라이런 — --apply를 붙여야 실제 등록됩니다.");
  process.exit(0);
}

if (fresh.length === 0) {
  console.log("\n등록할 것이 없다.");
  process.exit(0);
}

const { error: insertError } = await db
  .from("prediction_matches")
  .insert(fresh.map((e) => e.row));
if (insertError) {
  console.error(`\n등록 실패: ${insertError.message}`);
  process.exit(1);
}
console.log(`\n등록 완료 — 신규 ${fresh.length}건 · 건너뜀 ${entries.length - fresh.length}건`);
