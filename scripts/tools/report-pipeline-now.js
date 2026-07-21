#!/usr/bin/env node
/**
 * "지금 파이프라인 상태는?"를 한 화면에 답한다.
 *
 * 왜 필요한가: 기존 `pipeline:status`는 tmp/ 로컬 리포트를 읽는데, 그 파일들은
 * 마지막으로 로컬에서 파이프라인을 돌린 시점(수개월 전일 수 있음)에 멈춰 있다.
 * 날짜 표시가 없어 최신처럼 보이고, 실제로 오판을 유발했다.
 * 이 도구는 권위 있는 출처만 본다 — GitHub Actions 실행 기록과 서빙 DB.
 * 로컬 산출물은 신선도를 명시해 참고용으로만 보여준다.
 *
 * 사용: npm run pipeline:now
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadOpponentIdentityDecisions } = require("./lib/player-ledger");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.join(__dirname, "..", "..");
const REPO = "sanpark9038/nzu-homepage-v2";

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return fallback;
  }
}

function daysAgo(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function freshness(value) {
  const n = daysAgo(value);
  if (n === null) return "시각 불명";
  if (n === 0) return "오늘";
  if (n === 1) return "어제";
  return `${n}일 전`;
}

function section(title) {
  console.log(`\n${title}`);
}

function line(label, value) {
  console.log(`  ${String(label).padEnd(18)} ${value}`);
}

function lastPipelineRun() {
  try {
    const raw = execFileSync(
      "gh",
      ["run", "list", "-R", REPO, "--workflow=ops-pipeline-cache.yml", "--limit", "1", "--json",
       "status,conclusion,createdAt,displayTitle,event,url"],
      { encoding: "utf8", timeout: 30000 }
    );
    return JSON.parse(raw)[0] || null;
  } catch {
    return null; // gh 미설치·미인증이면 이 구역만 건너뛴다
  }
}

async function servingState() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { unavailable: "Supabase 환경변수 없음" };

  const { createClient } = require("@supabase/supabase-js");
  const c = createClient(url, key);
  const { data, error } = await c
    .from("players")
    .select("name,university,match_history,last_synced_at,eloboard_id");
  if (error) return { unavailable: error.message };

  const rows = data || [];
  const zero = rows.filter((r) => !Array.isArray(r.match_history) || r.match_history.length === 0);
  const synced = rows
    .map((r) => r.last_synced_at)
    .filter(Boolean)
    .sort()
    .pop();
  return { total: rows.length, zero, lastSynced: synced, rows };
}

function pendingDecisions(servingRows) {
  const items = [];

  // 1. 자동 판정이 결론을 못 내 사람 손이 필요한 건
  const syncReport = readJsonIfExists(path.join(ROOT, "tmp/reports/team_roster_sync_report.json"), null);
  if (syncReport) {
    const mismatches = syncReport.temporary_override_mismatches || [];
    const releases = syncReport.temporary_override_releases || [];
    if (mismatches.length) items.push(`확인 필요 ${mismatches.length}건 (교정과 엘로보드 불일치)`);
    if (releases.length) items.push(`해제 대기 ${releases.length}건 (교정이 관측과 일치)`);
  }

  // 2. 우리 선수가 "외부인" 이름 규칙에 걸려 수집에서 빠지는 건 (조용한 미수집의 원인)
  const decisions = loadOpponentIdentityDecisions();
  const external = new Set(
    (decisions.decisions || [])
      .filter((r) => String(r.decision || "").trim() === "external_opponent")
      .map((r) => String(r.opponent_name || "").trim())
  );
  const clashes = [];
  const projectsDir = path.join(ROOT, "data/metadata/projects");
  if (fs.existsSync(projectsDir)) {
    for (const dir of fs.readdirSync(projectsDir)) {
      const doc = readJsonIfExists(path.join(projectsDir, dir, `players.${dir}.v1.json`), null);
      if (!doc) continue;
      for (const r of doc.roster || []) {
        if (external.has(String(r.name || "").trim())) clashes.push(`${r.name}(${dir})`);
      }
    }
  }
  if (clashes.length) items.push(`이름충돌 수집제외 ${clashes.length}명: ${clashes.join(", ")}`);

  // 3. 로스터에 있는데 경기 기록이 없는 선수 (수집이 도달하지 못한 선수)
  if (Array.isArray(servingRows)) {
    const zeroNames = servingRows
      .filter((r) => !Array.isArray(r.match_history) || r.match_history.length === 0)
      .map((r) => r.name);
    if (zeroNames.length) items.push(`경기기록 0건 ${zeroNames.length}명: ${zeroNames.join(", ")}`);
  }

  return items;
}

(async () => {
  console.log("\n===== 파이프라인 지금 상태 =====");

  section("[1] 마지막 파이프라인 실행 (GitHub Actions)");
  const run = lastPipelineRun();
  if (!run) {
    line("결과", "조회 불가 (gh CLI 미설치·미인증) — GitHub Actions 페이지에서 확인");
  } else {
    const state = run.status === "completed" ? (run.conclusion === "success" ? "성공" : `실패(${run.conclusion})`) : `진행 중(${run.status})`;
    line("결과", state);
    line("시작", `${String(run.createdAt).slice(0, 16).replace("T", " ")} (${freshness(run.createdAt)})`);
    line("실행 방식", run.event === "schedule" ? "정규 스케줄" : "수동 실행");
  }

  section("[2] 사이트에 실제 나가 있는 데이터 (서빙 DB)");
  const serving = await servingState();
  if (serving.unavailable) {
    line("결과", `조회 불가 — ${serving.unavailable}`);
  } else {
    line("선수", `${serving.total}명`);
    line("마지막 동기화", `${String(serving.lastSynced || "-").slice(0, 16).replace("T", " ")} (${freshness(serving.lastSynced)})`);
    line("경기기록 0건", serving.zero.length ? `${serving.zero.length}명 — ${serving.zero.map((r) => r.name).join(", ")}` : "없음");
  }

  section("[3] 사람의 판단이 필요한 것");
  const pending = pendingDecisions(serving.rows);
  if (!pending.length) console.log("  없음 — 대기 중인 결정이 없습니다");
  else for (const p of pending) console.log(`  - ${p}`);

  section("[4] 로컬 산출물 신선도 (참고용 — 오래됐으면 믿지 말 것)");
  const localFiles = [
    ["동기화 리포트", "tmp/reports/team_roster_sync_report.json", "generated_at"],
    ["일일 스냅샷", "tmp/reports/daily_pipeline_snapshot_latest.json", "generated_at"],
    ["경기기록 아티팩트", "tmp/reports/player_history_artifacts_latest.json", "generated_at"],
  ];
  for (const [label, rel, field] of localFiles) {
    const doc = readJsonIfExists(path.join(ROOT, rel), null);
    if (!doc) { line(label, "없음"); continue; }
    const at = doc[field];
    const n = daysAgo(at);
    const warn = n !== null && n >= 2 ? "  ← 오래됨, 판단 근거로 쓰지 말 것" : "";
    line(label, `${String(at || "-").slice(0, 16).replace("T", " ")} (${freshness(at)})${warn}`);
  }

  console.log("\n조사할 선수가 있으면: npm run player:truth -- <이름>\n");
})();
