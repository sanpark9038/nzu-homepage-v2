"use client";

// 오버레이 사용 신청 게이트 — 등록 선수가 아니고 아직 승인도 안 된 로그인 사용자에게 보임.
// 톤: "선수 전용" 같은 배제 표현 대신 "테스트 기간 + 단계적 오픈"으로 안내(반발 방지).
import { useState } from "react";

export function AccessGate({ initialStatus, displayName }: {
  initialStatus: "pending" | "none";
  displayName: string;
}) {
  const [status, setStatus] = useState<"pending" | "none">(initialStatus);
  const [role, setRole] = useState<"streamer" | "manager">("streamer");
  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/overlay/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, target: target.trim() }),
      });
      const p = await r.json();
      if (p.ok) setStatus("pending");
      else setError(p.message || "신청에 실패했어요. 잠시 후 다시 시도해주세요.");
    } catch {
      setError("신청에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-2xl font-black text-white/95">방송 스코어보드</h1>
        <p className="mt-3 text-base leading-relaxed text-white/65">
          스트리머·매니저를 위한 <b className="text-white/90">방송 오버레이 도구</b>입니다.<br />
          지금은 <b className="text-white/90">테스트 기간</b> — 신청 후 승인되면 바로 사용할 수 있어요.
        </p>

        {status === "pending" ? (
          <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3.5">
            <p className="text-sm font-bold text-emerald-300">신청이 접수됐어요</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/60">
              <b>{displayName}</b>님의 신청을 확인 후 승인해 드릴게요. 승인되면 이 페이지에서 바로 사용할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <p className="mb-2 text-sm font-bold text-white/55">누구신가요?</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { v: "streamer", label: "스트리머 본인" },
                  { v: "manager",  label: "매니저" },
                ] as const).map(o => (
                  <button key={o.v} onClick={() => setRole(o.v)}
                    className={`h-11 rounded-lg text-base font-bold border transition-all ${
                      role === o.v
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-white/[0.03] border-white/10 text-white/45 hover:text-white/80"
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-white/55">
                {role === "streamer" ? "SOOP TV 아이디" : "어느 스트리머의 매니저이신가요?"}
              </p>
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                maxLength={80}
                placeholder={role === "streamer" ? "예: ddoongcar" : "예: 호사가TV 매니저입니다"}
                className="w-full rounded-lg bg-white/5 border border-white/12 px-3.5 py-3 text-base outline-none placeholder:text-white/20 focus:border-purple-500/50 transition-colors"
              />
              {role === "streamer" && (
                <p className="mt-1.5 text-xs text-white/40">
                  숲티비 채널 주소에 쓰는 아이디예요. (ch.sooplive.co.kr/<b className="text-white/60">아이디</b>)
                </p>
              )}
              {role === "manager" && (
                <p className="mt-1.5 text-xs text-white/40">
                  매니저분들은 본인 아이디로 로그인한 상태에서 신청해주시면 감사하겠습니다.
                </p>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button onClick={submit} disabled={!target.trim() || submitting}
              className="w-full h-12 rounded-xl bg-purple-600 text-base font-bold text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {submitting ? "신청 중..." : "사용 신청"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
