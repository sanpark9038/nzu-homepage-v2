"use client";

// 오버레이 사용 신청 승인 화면 — 신청(대기)을 승인하면 곧 허용 목록이 된다.
// (등록 선수는 자동 통과라 여기 안 나옴 — 여기 있는 건 스트리머 본인·매니저 신청뿐)
import { useCallback, useEffect, useState } from "react";

type Entry = {
  provider_user_id: string;
  display_name: string;
  role: string;
  target: string;
  status: string;
  created_at: string;
  approved_at: string | null;
};

export function OverlayAccessAdmin() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/overlay-access")
      .then(r => r.json())
      .then(p => {
        if (p.ok) setEntries(p.entries);
        else setError(p.message || "목록을 불러오지 못했어요");
      })
      .catch(() => setError("목록을 불러오지 못했어요"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action: "approve" | "remove", providerUserId: string) => {
    setBusy(providerUserId);
    setError(null);
    try {
      const r = await fetch("/api/admin/overlay-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, providerUserId }),
      });
      const p = await r.json();
      if (!p.ok) setError(p.message || "처리 실패");
      load();
    } catch {
      setError("처리 실패");
    } finally {
      setBusy(null);
    }
  };

  if (!entries) return <p className="text-sm text-muted-foreground">{error ?? "불러오는 중..."}</p>;

  const pending = entries.filter(e => e.status === "pending");
  const approved = entries.filter(e => e.status === "approved");

  const row = (e: Entry) => (
    <tr key={e.provider_user_id} className="border-t border-border/50">
      <td className="p-2 font-mono text-xs">{e.provider_user_id}</td>
      <td className="p-2">{e.display_name}</td>
      <td className="p-2">{e.role === "streamer" ? "스트리머 본인" : "매니저"}</td>
      <td className="p-2 max-w-[240px] truncate" title={e.target}>{e.target}</td>
      <td className="p-2 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("ko-KR")}</td>
      <td className="p-2 text-right">
        <div className="inline-flex items-center gap-1.5">
          {e.status === "pending" && (
            <button onClick={() => act("approve", e.provider_user_id)} disabled={busy === e.provider_user_id}
              className="rounded-lg bg-nzu-green px-3 py-1.5 text-xs font-bold text-white hover:opacity-85 disabled:opacity-40">
              승인
            </button>
          )}
          <button onClick={() => act("remove", e.provider_user_id)} disabled={busy === e.provider_user_id}
            title={e.status === "approved" ? "허용을 회수합니다 (다시 신청 가능)" : "신청을 거절합니다 (다시 신청 가능)"}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-40">
            삭제
          </button>
        </div>
      </td>
    </tr>
  );

  const table = (list: Entry[], empty: string) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr>
            <th className="p-2 text-left">숲 ID</th>
            <th className="p-2 text-left">이름</th>
            <th className="p-2 text-left">역할</th>
            <th className="p-2 text-left">채널 / 담당 스트리머</th>
            <th className="p-2 text-left">신청일</th>
            <th className="p-2 text-right">처리</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0
            ? <tr><td colSpan={6} className="p-4 text-center text-xs text-muted-foreground">{empty}</td></tr>
            : list.map(row)}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <section className="space-y-2">
        <h2 className="font-bold">승인 대기 {pending.length > 0 && <span className="text-nzu-green">({pending.length})</span>}</h2>
        {table(pending, "대기 중인 신청이 없습니다")}
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">승인됨 ({approved.length})</h2>
        <p className="text-xs text-muted-foreground">등록 선수는 자동 허용이라 이 목록에 없습니다. 여기는 신청으로 예외 허용된 사람만.</p>
        {table(approved, "승인된 신청이 없습니다")}
      </section>
    </div>
  );
}
