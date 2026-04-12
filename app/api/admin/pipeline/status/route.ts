import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RunState = {
  pid: number;
  started_at: string;
  status: "running" | "finished";
  mode: string;
  teams: string;
  log_path: string;
  finished_at?: string;
};

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "tmp", ".cache");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const STATE_PATH = path.join(CACHE_DIR, "pipeline_run_state.json");

function readState(): RunState | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  const raw = fs.readFileSync(STATE_PATH, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as RunState;
}

function writeState(next: RunState) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), "utf8");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function latestPipelineFiles() {
  const snapshotPath = path.join(REPORTS_DIR, "daily_pipeline_snapshot_latest.json");
  const alertsPath = path.join(REPORTS_DIR, "daily_pipeline_alerts_latest.json");

  return {
    latest_snapshot: snapshotPath && fs.existsSync(snapshotPath) ? snapshotPath : null,
    latest_alerts: alertsPath && fs.existsSync(alertsPath) ? alertsPath : null,
  };
}

export async function GET() {
  let state = readState();
  if (state?.status === "running" && !isPidAlive(state.pid)) {
    state = {
      ...state,
      status: "finished",
      finished_at: new Date().toISOString(),
    };
    writeState(state);
  }

  const latest = latestPipelineFiles();
  return NextResponse.json({
    ok: true,
    state,
    latest_snapshot: latest.latest_snapshot,
    latest_alerts: latest.latest_alerts,
  });
}
