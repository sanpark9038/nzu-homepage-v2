import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getAdminWriteDisabledMessage, isAdminWriteDisabled } from "@/lib/admin-runtime";

export const runtime = "nodejs";

const ROOT = process.cwd();
const RULES_PATH = path.join(ROOT, "data", "metadata", "pipeline_alert_rules.v1.json");

function defaultRules() {
  return {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    blocking_severities: ["critical", "high"],
    rules: {
      pipeline_failure_severity: "critical",
      zero_record_players_severity: "high",
      negative_delta_matches_severity: "critical",
      roster_size_changed_severity: "medium",
      no_new_matches_enabled: false,
      no_new_matches_severity: "low",
    },
  };
}

function readRules() {
  if (!fs.existsSync(RULES_PATH)) return defaultRules();
  try {
    const raw = fs.readFileSync(RULES_PATH, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return {
      ...defaultRules(),
      ...parsed,
      rules: {
        ...defaultRules().rules,
        ...(parsed && parsed.rules ? parsed.rules : {}),
      },
    };
  } catch {
    return defaultRules();
  }
}

function writeRules(doc: ReturnType<typeof defaultRules>) {
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, JSON.stringify(doc, null, 2), "utf8");
}

export async function GET() {
  return NextResponse.json({ ok: true, rules: readRules() });
}

export async function POST(req: Request) {
  if (isAdminWriteDisabled()) {
    return NextResponse.json(
      { ok: false, message: getAdminWriteDisabledMessage("파이프라인 알림 규칙 수정") },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ReturnType<typeof defaultRules>;
  const next = {
    ...defaultRules(),
    ...body,
    updated_at: new Date().toISOString(),
    rules: {
      ...defaultRules().rules,
      ...(body && body.rules ? body.rules : {}),
    },
  };
  writeRules(next);
  return NextResponse.json({ ok: true, rules: next });
}
