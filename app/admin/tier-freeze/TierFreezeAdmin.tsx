"use client";

import { useState } from "react";

type FreezeState = { active: boolean; frozenAt: string; playerCount: number } | null;

function formatFrozenAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TierFreezeAdmin({ initialFreeze }: { initialFreeze: FreezeState }) {
  const [freeze, setFreeze] = useState<FreezeState>(initialFreeze);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function send(action: "freeze" | "unfreeze") {
    if (action === "freeze" && !window.confirm("지금 시점의 티어로 다시 얼립니다. 계속할까요?")) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/tier-freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "티어 동결 변경에 실패했습니다.");
      setFreeze(json.freeze ?? null);
      setMessage(action === "freeze" ? "현재 티어로 동결했습니다." : "동결을 해제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "티어 동결 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-card p-6">
      <p className="text-sm font-bold text-white/80">
        {freeze
          ? `동결 중 · ${freeze.playerCount}명 · ${formatFrozenAt(freeze.frozenAt)} 기준`
          : "동결 해제 상태"}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => send("freeze")}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-black text-black disabled:opacity-50"
        >
          티어 동결 시작
        </button>
        <button
          type="button"
          onClick={() => send("unfreeze")}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-black text-white/75 hover:bg-white/5 disabled:opacity-50"
        >
          동결 해제
        </button>
      </div>

      {message ? <p className="mt-4 text-sm font-bold text-white/75">{message}</p> : null}
    </section>
  );
}
