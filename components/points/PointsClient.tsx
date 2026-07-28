"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardRow, MyPoints, PointReason } from "@/lib/points";

type PointsPayload = {
  me: MyPoints | null;
  leaderboard: LeaderboardRow[];
  attendanceReward: number;
};

const REASON_LABEL: Record<PointReason, string> = {
  signup_bonus: "가입 보너스",
  attendance: "출석",
  bet_place: "베팅",
  bet_refund: "환불",
  bet_payout: "적중 배당",
};

function formatPoints(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** 잔액이 굴러 올라가는 정도의 가벼운 피드백 (라이브러리 없이 rAF). */
function useRollingNumber(target: number, duration = 500) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      valueRef.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export function PointsClient() {
  const [data, setData] = useState<PointsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/points", { cache: "no-store" });
    const payload = (await res.json()) as PointsPayload;
    setData(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load().catch(() => setLoading(false));
  }, [load]);

  const balance = useRollingNumber(data?.me?.balance ?? 0);
  const reward = data?.attendanceReward ?? 100;

  async function handleAttendance() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/points/attendance", { method: "POST" });
      const result = (await res.json()) as { ok?: boolean; alreadyClaimed?: boolean; message?: string };
      if (!res.ok) {
        setMessage(result.message === "points_login_required" ? "로그인이 필요합니다." : result.message || "출석 실패");
        return;
      }
      setMessage(result.alreadyClaimed ? "오늘은 이미 출석했습니다." : `출석 완료! +${reward}P`);
      await load();
    } catch {
      setMessage("출석 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="hosaga-card px-5 py-8 text-center text-sm font-medium text-white/45">
        불러오는 중...
      </section>
    );
  }

  const me = data?.me ?? null;
  const leaderboard = data?.leaderboard ?? [];

  return (
    <div className="space-y-3">
      <section className="hosaga-card px-4 py-4 md:px-5 md:py-5">
        {me ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="ui-label uppercase text-white/45">My Points</div>
              <div className="mt-1 text-3xl font-bold text-nzu-green md:text-4xl">
                {formatPoints(balance)}
                <span className="ml-1 text-base font-bold text-white/45">P</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleAttendance()}
              disabled={busy || me.attendedToday}
              className="rounded-lg bg-nzu-green px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
            >
              {me.attendedToday ? "출석 완료" : `출석 체크 +${reward}`}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-white/58">
            <span>로그인 후 출석 체크로 포인트를 모을 수 있습니다.</span>
            <a
              href="/api/auth/soop/start?next=/points"
              className="rounded-lg bg-nzu-green px-4 py-2 text-xs font-bold text-black transition hover:brightness-110"
            >
              LOGIN
            </a>
          </div>
        )}

        {message ? <p className="mt-3 text-sm font-medium text-white/60">{message}</p> : null}
      </section>

      <section className="hosaga-card overflow-hidden">
        <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white md:px-5">랭킹</div>
        {leaderboard.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-medium text-white/45">아직 랭킹이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {leaderboard.map((row) => (
              <li key={`${row.rank}-${row.displayName}`} className="flex items-center gap-3 px-4 py-2.5 md:px-5">
                <span className="w-8 shrink-0 text-sm font-bold text-white/40">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">{row.displayName}</span>
                <span className="shrink-0 text-sm font-bold text-nzu-green">{formatPoints(row.balance)}P</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {me ? (
        <section className="hosaga-card overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white md:px-5">내 최근 내역</div>
          {me.ledger.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm font-medium text-white/45">내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {me.ledger.map((entry) => (
                <li
                  key={`${entry.reason}-${entry.refId}-${entry.createdAt}`}
                  className="flex items-center gap-3 px-4 py-2.5 md:px-5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">
                    {REASON_LABEL[entry.reason] || entry.reason}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-white/35">{formatDate(entry.createdAt)}</span>
                  <span
                    className={`w-20 shrink-0 text-right text-sm font-bold ${
                      entry.amount >= 0 ? "text-nzu-green" : "text-hosaga-loss"
                    }`}
                  >
                    {entry.amount >= 0 ? "+" : ""}
                    {formatPoints(entry.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
