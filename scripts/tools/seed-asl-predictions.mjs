/**
 * ASL 24강 승부예측 12경기(6개조 × 2경기)를 prediction_matches에 등록한다. 일회성 시딩.
 *
 * 기본은 드라이런 — 등록될 행을 표로 보여주기만 한다. `--apply`가 있어야 실제 insert.
 * 선수 이름·날짜는 여기 다시 적지 않는다. lib/asl.ts 한 벌에서만 온다 —
 * 두 벌로 적으면 조 편성이 바뀌었을 때 화면과 예측이 조용히 어긋난다.
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

/** 당일 오후 6시 반 마감 — 방송(19:00) 30분 전 */
const CLOSE_TIME = "18:30";

/**
 * 명단 순서가 대진이다: players[0] vs players[1] = 1경기, players[2] vs players[3] = 2경기.
 * display_order는 조 순서×10 + 경기번호 (A조1=11 … F조2=62).
 */
function buildRows(displayOrderOffset = 0) {
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
const db = supabase();

// 기존 경기를 읽어 (1) 같은 title 재등록 방지 (2) display_order 충돌 방지
const { data: existing, error } = await db
  .from("prediction_matches")
  .select("title, display_order")
  .is("archived_at", null);
if (error) {
  console.error(`기존 경기를 읽지 못했다: ${error.message}`);
  process.exit(1);
}

const takenTitles = new Set(existing.map((row) => row.title));
const maxOrder = existing.reduce((max, row) => Math.max(max, row.display_order ?? 0), 0);
const rows = buildRows(maxOrder);

console.log(`${ASL_SEASON} 24강 승부예측 — 등록 대상 ${rows.length}건 (기존 ${existing.length}건)\n`);
console.log("  제목                            대진                마감(KST)         순서  상태");
console.log("  " + "-".repeat(88));
for (const row of rows) {
  const dup = takenTitles.has(row.title);
  console.log(
    "  " +
      [
        row.title.padEnd(30),
        `${row.team_a_name} vs ${row.team_b_name}`.padEnd(18),
        row.close_at.slice(0, 16).replace("T", " ").padEnd(17),
        String(row.display_order).padEnd(5),
        dup ? "이미 있음" : "신규",
      ].join(" ")
  );
}

const fresh = rows.filter((row) => !takenTitles.has(row.title));

if (!apply) {
  console.log(`\n드라이런 — --apply를 붙여야 실제 등록됩니다. (신규 ${fresh.length}건)`);
  process.exit(0);
}

if (fresh.length === 0) {
  console.log("\n전부 이미 있다 — 등록할 것이 없다.");
  process.exit(0);
}

const { error: insertError } = await db.from("prediction_matches").insert(fresh);
if (insertError) {
  console.error(`\n등록 실패: ${insertError.message}`);
  process.exit(1);
}
console.log(`\n등록 완료 — 신규 ${fresh.length}건 · 건너뜀 ${rows.length - fresh.length}건`);
