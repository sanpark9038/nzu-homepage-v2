#!/usr/bin/env node
/**
 * 선수 한 명의 "지금 진실"을 한 화면에 보여준다.
 *
 * 왜 필요한가: 한 선수의 소속·티어가 5개 층(로스터 파일 / 로컬 교정 / 원격 교정 /
 * 엘로보드 관측 / 서빙 DB)에 흩어져 있고 우선순위는 코드에만 있다. 어느 층이 이겨서
 * 사이트에 그 값이 나오는지 확인하려면 매번 파일 3개와 DB 2개를 따로 조회해야 했다.
 * 이 도구는 그 조회를 한 번에 하고, 층 사이가 어긋난 곳을 표시한다.
 *
 * 사용: npm run player:truth -- 김설
 *       npm run player:truth -- eloboard:female:659
 */
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.join(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const { loadOpponentIdentityDecisions } = require("./lib/player-ledger");
const SYNC_REPORT_PATH = path.join(ROOT, "tmp", "reports", "team_roster_sync_report.json");

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return fallback;
  }
}

function norm(value) {
  return String(value || "").trim();
}

function matchesQuery(row, query) {
  const q = norm(query).toLowerCase();
  return norm(row.name).toLowerCase() === q || norm(row.entity_id).toLowerCase() === q;
}

function findInRosterFiles(query) {
  if (!fs.existsSync(PROJECTS_DIR)) return null;
  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    const filePath = path.join(PROJECTS_DIR, dir, `players.${dir}.v1.json`);
    const doc = readJsonIfExists(filePath, null);
    if (!doc) continue;
    for (const row of doc.roster || []) {
      if (matchesQuery(row, query)) {
        return { team_code: dir, team_name: norm(doc.team_name), row, file: path.relative(ROOT, filePath) };
      }
    }
  }
  return null;
}

function findLocalOverride(query) {
  const doc = readJsonIfExists(OVERRIDES_PATH, { overrides: [] });
  return (doc.overrides || []).find((row) => matchesQuery(row, query)) || null;
}

function findObserved(entityId, name) {
  const report = readJsonIfExists(SYNC_REPORT_PATH, null);
  if (!report) return { missing_report: true };
  const hit = (report.temporary_override_mismatches || []).find((row) => norm(row.name) === norm(name));
  const released = (report.temporary_override_releases || []).find(
    (row) => norm(row.entity_id) === norm(entityId) || norm(row.name) === norm(name)
  );
  const moved = (report.moved || []).find((row) => norm(row.entity_id) === norm(entityId));
  return { generated_at: report.generated_at, mismatch: hit || null, released: released || null, moved: moved || null };
}

function collectionExclusion(entityId, wrId, name) {
  const reasons = [];
  const doc = readJsonIfExists(EXCLUSIONS_PATH, { players: [] });
  for (const rule of doc.players || []) {
    if (rule.entity_id && norm(rule.entity_id) === norm(entityId)) reasons.push(`제외목록(entity_id): ${rule.reason}`);
    else if (rule.wr_id && rule.name && Number(rule.wr_id) === Number(wrId) && norm(rule.name) === norm(name).toLowerCase())
      reasons.push(`제외목록(wr_id+이름): ${rule.reason}`);
    else if (rule.wr_id && !rule.name && Number(rule.wr_id) === Number(wrId)) reasons.push(`제외목록(wr_id): ${rule.reason}`);
  }

  // 외부인 결정은 이름만으로 수집 제외를 만든다 — 동명이인이 걸리면 조용히 미수집된다.
  const decisions = loadOpponentIdentityDecisions();
  const external = (decisions.decisions || []).find(
    (row) => norm(row.decision) === "external_opponent" && norm(row.opponent_name) === norm(name)
  );
  if (external) reasons.push(`외부인 결정(이름 일치) — ${external.match_rows}행`);

  return reasons;
}

async function loadServing(entityId, name) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { unavailable: "Supabase 환경변수 없음" };

  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(url, key);

  const players = await client
    .from("players")
    .select("name,university,tier,race,match_history,last_synced_at,eloboard_id,serving_identity_key")
    .or(`eloboard_id.eq.${entityId},name.eq.${name}`);
  const corrections = await client
    .from("roster_admin_corrections")
    .select("*")
    .or(`entity_id.eq.${entityId},name.eq.${name}`);

  const player = (players.data || [])[0] || null;
  const matchRows = player && Array.isArray(player.match_history) ? player.match_history.length : 0;
  return { player, matchRows, correction: (corrections.data || [])[0] || null };
}

function line(label, value) {
  console.log(`  ${String(label).padEnd(16)} ${value}`);
}

(async () => {
  const query = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!query) {
    console.error("사용: npm run player:truth -- <선수이름 | entity_id>");
    process.exit(1);
  }

  const roster = findInRosterFiles(query);
  const name = roster ? norm(roster.row.name) : query;
  const entityId = roster ? norm(roster.row.entity_id) : query;
  const wrId = roster ? roster.row.wr_id : null;

  console.log(`\n=== ${name} ${entityId ? `(${entityId})` : ""} ===\n`);

  console.log("[1] 로스터 파일 — 수집 대상과 팀 소속의 기준");
  if (roster) {
    line("팀", `${roster.team_name || "-"} (${roster.team_code})`);
    line("티어/종족", `${norm(roster.row.tier) || "-"} / ${norm(roster.row.race) || "-"}`);
    line("파일", roster.file);
  } else {
    line("결과", "★ 어느 로스터 파일에도 없음 — 수집 대상이 아님");
  }

  console.log("\n[2] 수동 교정 — 파일보다 우선, 원격이 로컬을 덮음");
  const localOverride = findLocalOverride(query);
  line("로컬 파일", localOverride ? `팀=${norm(localOverride.team_code) || "-"} 티어=${norm(localOverride.tier) || "-"} (${localOverride.manual_mode || "-"})` : "없음");

  const serving = await loadServing(entityId, name);
  if (serving.unavailable) {
    line("원격(DB)", `조회 불가 — ${serving.unavailable}`);
  } else if (serving.correction) {
    const c = serving.correction;
    line("원격(DB)", `팀=${norm(c.team_code) || "-"} 티어=${norm(c.tier) || "-"} lock=${c.manual_lock} mode=${c.manual_mode || "-"}`);
    if (norm(c.note)) line("메모", norm(c.note).slice(0, 70));
  } else {
    line("원격(DB)", "없음");
  }

  console.log("\n[3] 엘로보드 관측 — 자동 판정의 근거");
  const observed = findObserved(entityId, name);
  if (observed.missing_report) {
    line("결과", "동기화 리포트 없음 — `npm run sync:team:roster -- --report-only` 먼저 실행");
  } else {
    line("리포트 시각", String(observed.generated_at).slice(0, 19));
    if (observed.mismatch) {
      line("판정", `불일치(${observed.mismatch.reason})`);
      for (const f of observed.mismatch.fields || []) {
        line("", `  ${f.field}: 교정=${f.manual} vs 관측=${f.observed === null ? "(명단에 없음)" : f.observed || "(빈값)"}`);
      }
    } else if (observed.released) {
      line("판정", "교정과 일치 → 해제 대상");
    } else {
      line("판정", "검토 대상 아님");
    }
    if (observed.moved) line("소속 이동", `${observed.moved.from} → ${observed.moved.to} (${observed.moved.change_confidence})`);
  }

  console.log("\n[4] 수집 상태");
  const exclusions = collectionExclusion(entityId, wrId, name);
  line("제외 사유", exclusions.length ? exclusions.join(" / ") : "없음 (수집 대상)");
  if (!serving.unavailable) {
    line("경기 기록", serving.matchRows > 0 ? `${serving.matchRows}행` : "★ 0행 — 수집된 적 없음");
    line("마지막 동기화", serving.player && serving.player.last_synced_at ? String(serving.player.last_synced_at).slice(0, 10) : "★ 없음");
  }

  console.log("\n[5] 사이트에 실제 보이는 값 (서빙 DB)");
  if (serving.unavailable) {
    line("결과", `조회 불가 — ${serving.unavailable}`);
  } else if (serving.player) {
    line("팀", norm(serving.player.university) || "-");
    line("티어/종족", `${norm(serving.player.tier) || "-"} / ${norm(serving.player.race) || "-"}`);
  } else {
    line("결과", "★ 서빙 DB에 없음 — 사이트에 안 보임");
  }

  // 층 사이 어긋남만 모아 보여준다. 오늘 헷갈렸던 지점이 전부 여기서 드러난다.
  console.log("\n[!] 층 사이 어긋남");
  const conflicts = [];
  if (roster && serving.player) {
    // 파일은 팀 코드(ssg), 서빙은 팀 이름(신세계)으로 부르므로 이름 기준으로 비교한다.
    const fileTeam = roster.team_name || roster.team_code;
    const servingTeam = norm(serving.player.university);
    if (servingTeam && fileTeam && servingTeam !== fileTeam) {
      conflicts.push(`로스터 파일=${fileTeam} vs 사이트=${servingTeam} — 교정이 덮고 있다`);
    }
  }
  if (localOverride && serving.correction) {
    const l = norm(localOverride.team_code);
    const r = norm(serving.correction.team_code);
    if (l !== r) conflicts.push(`교정 로컬=${l || "-"} vs 원격=${r || "-"} — 원격이 이긴다`);
  }
  if (exclusions.length && roster) conflicts.push("로스터에 있는데 수집 제외 상태 — 의도한 것인지 확인");
  if (!serving.unavailable && serving.matchRows === 0 && roster) conflicts.push("로스터에 있는데 경기 기록 0행");
  console.log(conflicts.length ? conflicts.map((c) => `  - ${c}`).join("\n") : "  없음");
  console.log("");
})();
