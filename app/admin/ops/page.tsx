import fs from "fs";
import path from "path";
import Link from "next/link";
import OpsControls from "./OpsControls";
import RosterEditor from "./RosterEditor";

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

function latestJsonByPrefix(prefix: string): string | null {
  const dir = path.join(process.cwd(), "tmp", "reports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .sort();
  if (!files.length) return null;
  return path.join(dir, files[files.length - 1]);
}

function readJson<T>(filePath: string | null): T | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

function badgeColor(level: string): string {
  if (level === "critical") return "bg-red-600 text-white";
  if (level === "high") return "bg-orange-500 text-white";
  if (level === "medium") return "bg-yellow-400 text-black";
  return "bg-zinc-300 text-black";
}

export default function AdminOpsPage() {
  const snapshotPath = latestJsonByPrefix("daily_pipeline_snapshot_");
  const alertsPath = latestJsonByPrefix("daily_pipeline_alerts_");
  const snapshot = readJson<SnapshotDoc>(snapshotPath);
  const alerts = readJson<AlertsDoc>(alertsPath);
  const teams = Array.isArray(snapshot?.teams) ? snapshot!.teams : [];
  const alertRows = Array.isArray(alerts?.alerts) ? alerts!.alerts : [];
  const counts = alerts?.counts || {};

  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Pipeline Ops (Temporary)</h1>
            <p className="text-sm text-muted-foreground">
              일일 자동 수집 상태와 이상치 알림을 확인하는 운영 페이지입니다.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/data-lab" className="text-sm underline text-nzu-green">
              Data Lab
            </Link>
            <Link href="/" className="text-sm underline text-nzu-green">
              홈으로
            </Link>
          </div>
        </div>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-2">Latest Snapshot</h2>
            <p className="text-sm">{snapshot?.generated_at || "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              기간: {snapshot?.period_from || "-"} ~ {snapshot?.period_to || "-"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              파일: {snapshotPath ? path.relative(process.cwd(), snapshotPath) : "-"}
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-2">Alert Counts</h2>
            <p className="text-sm">critical {counts.critical || 0}</p>
            <p className="text-sm">high {counts.high || 0}</p>
            <p className="text-sm">medium {counts.medium || 0}</p>
            <p className="text-sm">low {counts.low || 0}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-2">Status</h2>
            <p className="text-sm">
              {(counts.critical || 0) > 0 || (counts.high || 0) > 0 ? "주의 필요" : "정상"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              파일: {alertsPath ? path.relative(process.cwd(), alertsPath) : "-"}
            </p>
          </div>
        </section>

        <OpsControls />
        <RosterEditor />

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Team Health</h2>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr>
                  <th className="text-left p-2">팀</th>
                  <th className="text-right p-2">인원</th>
                  <th className="text-right p-2">총전적</th>
                  <th className="text-right p-2">fetch 실패</th>
                  <th className="text-right p-2">csv 실패</th>
                  <th className="text-right p-2">0건 선수</th>
                  <th className="text-right p-2">전일 대비</th>
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
                    <td className="p-2 text-right">
                      {typeof t.delta_total_matches === "number" ? t.delta_total_matches : "-"}
                    </td>
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
                <div key={`${a.team_code}-${a.rule}-${idx}`} className="border border-border rounded-lg p-3 bg-card">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${badgeColor(a.severity)}`}>{a.severity}</span>
                    <span className="text-sm font-semibold">{a.team}</span>
                    <span className="text-xs text-muted-foreground">{a.rule}</span>
                  </div>
                  <p className="text-sm mt-2">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
