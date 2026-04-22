import fs from "fs";
import path from "path";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminReadonlyNotice } from "@/components/admin/AdminReadonlyNotice";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { isAdminWriteDisabled } from "@/lib/admin-runtime";
import OpsControls from "./OpsControls";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

type TeamRow = {
  team: string;
  team_code: string;
  players: number;
  fetch_fail: number;
  csv_fail: number;
  zero_record_players: number;
  total_matches: number;
  delta_total_matches: number | null;
};

type SnapshotDoc = {
  generated_at?: string;
  period_from?: string;
  period_to?: string;
  teams?: TeamRow[];
};

type AlertRow = {
  severity: "critical" | "high" | "medium" | "low";
  team: string;
  team_code: string;
  rule: string;
  message: string;
};

type AlertsDoc = {
  counts?: { critical?: number; high?: number; medium?: number; low?: number; total?: number };
  alerts?: AlertRow[];
};

function readJson<T>(filePath: string | null): T | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

function resolveLatestPipelineFiles() {
  const reportsDir = path.join(process.cwd(), "tmp", "reports");
  const snapshotPath = path.join(reportsDir, "daily_pipeline_snapshot_latest.json");
  const alertsPath = path.join(reportsDir, "daily_pipeline_alerts_latest.json");

  return {
    snapshotPath: snapshotPath && fs.existsSync(snapshotPath) ? snapshotPath : null,
    alertsPath: alertsPath && fs.existsSync(alertsPath) ? alertsPath : null,
  };
}

function badgeColor(level: string): string {
  if (level === "critical") return "bg-red-600 text-white";
  if (level === "high") return "bg-orange-500 text-white";
  if (level === "medium") return "bg-yellow-400 text-black";
  return "bg-zinc-300 text-black";
}

export default async function AdminOpsPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/ops");
  }

  const { snapshotPath, alertsPath } = resolveLatestPipelineFiles();
  const snapshot = readJson<SnapshotDoc>(snapshotPath);
  const alerts = readJson<AlertsDoc>(alertsPath);
  const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
  const alertRows = Array.isArray(alerts?.alerts) ? alerts.alerts : [];
  const counts = alerts?.counts || {};
  const readOnly = isAdminWriteDisabled();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminNav />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Pipeline Ops (Temporary)</h1>
            <p className="text-sm text-muted-foreground">일일 자동 수집 상태와 이상치 알림을 확인하는 운영 페이지입니다.</p>
          </div>
          <div className="flex gap-3">
            <LogoutButton />
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 font-bold">Latest Snapshot</h2>
            <p className="text-sm">{snapshot?.generated_at || "-"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              기간: {snapshot?.period_from || "-"} ~ {snapshot?.period_to || "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">파일: {snapshotPath ? path.relative(process.cwd(), snapshotPath) : "-"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 font-bold">Alert Counts</h2>
            <p className="text-sm">critical {counts.critical || 0}</p>
            <p className="text-sm">high {counts.high || 0}</p>
            <p className="text-sm">medium {counts.medium || 0}</p>
            <p className="text-sm">low {counts.low || 0}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 font-bold">Status</h2>
            <p className="text-sm">{(counts.critical || 0) > 0 || (counts.high || 0) > 0 ? "주의 필요" : "정상"}</p>
            <p className="mt-1 text-xs text-muted-foreground">파일: {alertsPath ? path.relative(process.cwd(), alertsPath) : "-"}</p>
          </div>
        </section>

        {readOnly ? <AdminReadonlyNotice /> : null}

        <OpsControls readOnly={readOnly} />

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold">Roster Admin</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                선수 수동 이동, 티어 수정, 수집 제외 관리는 전용 페이지에서 처리합니다.
              </p>
            </div>
            <Link
              href="/admin/roster"
              className="inline-flex items-center justify-center rounded-lg bg-nzu-green px-4 py-2 text-sm font-bold text-white"
            >
              로스터 관리 열기
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Team Health</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr>
                  <th className="p-2 text-left">팀</th>
                  <th className="p-2 text-right">인원</th>
                  <th className="p-2 text-right">총전적</th>
                  <th className="p-2 text-right">fetch 실패</th>
                  <th className="p-2 text-right">csv 실패</th>
                  <th className="p-2 text-right">0건 선수</th>
                  <th className="p-2 text-right">전일 대비</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.team_code} className="border-t border-border/50">
                    <td className="p-2">{t.team}</td>
                    <td className="p-2 text-right">{t.players}</td>
                    <td className="p-2 text-right">{t.total_matches}</td>
                    <td className="p-2 text-right">{t.fetch_fail}</td>
                    <td className="p-2 text-right">{t.csv_fail}</td>
                    <td className="p-2 text-right">{t.zero_record_players}</td>
                    <td className="p-2 text-right">{typeof t.delta_total_matches === "number" ? t.delta_total_matches : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Alerts</h2>
          {alertRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">현재 알림 없음</p>
          ) : (
            <div className="space-y-2">
              {alertRows.map((a, idx) => (
                <div key={`${a.team_code}-${a.rule}-${idx}`} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs ${badgeColor(a.severity)}`}>{a.severity}</span>
                    <span className="text-sm font-semibold">{a.team}</span>
                    <span className="text-xs text-muted-foreground">{a.rule}</span>
                  </div>
                  <p className="mt-2 text-sm">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
