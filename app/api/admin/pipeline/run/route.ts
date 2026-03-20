import fs from "fs";
import path from "path";
import { spawn } from "child_process";
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
const LOG_DIR = path.join(ROOT, "tmp", "logs");
const STATE_PATH = path.join(CACHE_DIR, "pipeline_run_state.json");
const SCRIPT_PATH = path.join(ROOT, "scripts", "tools", "run-daily-pipeline.js");

function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readState(): RunState | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  const raw = fs.readFileSync(STATE_PATH, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as RunState;
}

function writeState(next: RunState) {
  ensureDirs();
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

function toDateTag() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  ensureDirs();
  const current = readState();
  if (current?.status === "running" && isPidAlive(current.pid)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Pipeline is already running.",
        state: current,
      },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: "full" | "smoke";
    teams?: string;
  };
  const mode = body.mode === "smoke" ? "smoke" : "full";
  const teams = String(body.teams || (mode === "smoke" ? "black" : "")).trim();

  const dateTag = mode === "smoke" ? `${toDateTag()}-ops-smoke` : toDateTag();
  const from = "2025-01-01";
  const to = toDateTag();

  const args = [SCRIPT_PATH, "--from", from, "--to", to, "--date-tag", dateTag];
  if (teams) {
    args.push("--teams", teams);
  }

  const logPath = path.join(LOG_DIR, `pipeline-run-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  const outFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", outFd, outFd],
  });
  child.unref();
  fs.closeSync(outFd);

  writeState({
    pid: child.pid,
    started_at: new Date().toISOString(),
    status: "running",
    mode,
    teams: teams || "all",
    log_path: logPath,
  });

  return NextResponse.json({
    ok: true,
    message: "Pipeline started.",
    pid: child.pid,
    mode,
    teams: teams || "all",
    log_path: logPath,
  });
}

