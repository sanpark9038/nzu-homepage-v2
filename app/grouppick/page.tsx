"use client";

import { useState } from "react";
import { GROUPS, TEAMS, teamName, type GroupKey } from "./teams";

type Picks = Record<GroupKey, [string, string, string]>;

const SLOTS = [0, 1, 2] as const;
const EMPTY: Picks = { A: ["", "", ""], B: ["", "", ""], C: ["", "", ""], D: ["", "", ""] };

export default function GroupPickPage() {
  const [picks, setPicks] = useState<Picks>(EMPTY);
  const [name, setName] = useState("");
  const [hp, setHp] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const taken = new Set(GROUPS.flatMap((g) => picks[g]).filter(Boolean));
  const filled = GROUPS.every((g) => picks[g].every(Boolean));
  // 숲 아이디 형식 — 분리 배포된 제출 앱·API와 같은 규칙
  const canSubmit = filled && /^[a-z0-9_-]{3,20}$/.test(name.trim().toLowerCase()) && !sending;

  function setSlot(group: GroupKey, slot: (typeof SLOTS)[number], code: string) {
    setPicks((prev) => {
      const next: Picks = { ...prev, [group]: [...prev[group]] as [string, string, string] };
      next[group][slot] = code;
      return next;
    });
  }

  async function submit() {
    setSending(true);
    setError("");
    try {
      const groups = Object.fromEntries(GROUPS.map((g) => [g, [...picks[g]]]));
      const res = await fetch("/api/grouppick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim().toLowerCase(), groups, hp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? "접수가 마감되었어요. 잠시 후 다시 시도해 주세요."
            : body?.error === "invalid"
              ? "입력을 다시 확인해 주세요."
              : "제출에 실패했어요. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류로 제출하지 못했어요.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-xl font-bold text-[#2563EB]">제출 완료!</h1>
          <p className="mt-1 text-sm text-slate-500">{name.trim()} 님의 예측이 접수되었습니다.</p>
          <div className="mt-6 space-y-3">
            {GROUPS.map((g) => (
              <div key={g} className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-[#2563EB]">{g}조</div>
                <div className="mt-1 text-sm text-slate-700">
                  {picks[g].map(teamName).join(" · ")}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-400">
            같은 아이디로 다시 제출하면 마지막 예측만 집계됩니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold">중만컵 조편성 예측</h1>
        <p className="mt-1 text-sm text-slate-500">
          12팀을 4개 조에 3팀씩 배치해 주세요. 조 안의 순서는 상관없습니다.
        </p>

        <div className="mt-6 space-y-4">
          {GROUPS.map((group) => (
            <section key={group} className="rounded-2xl border border-slate-200 p-4">
              <h2 className="text-base font-bold text-[#2563EB]">{group}조</h2>
              <div className="mt-3 space-y-2">
                {SLOTS.map((slot) => (
                  <div key={slot} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">
                      {slot + 1}
                    </span>
                    <select
                      aria-label={`${group}조 ${slot + 1}번 팀`}
                      value={picks[group][slot]}
                      onChange={(event) => setSlot(group, slot, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:border-[#2563EB] focus:outline-none"
                    >
                      <option value="">팀 선택</option>
                      {TEAMS.filter(
                        (team) => !taken.has(team.code) || team.code === picks[group][slot]
                      ).map((team) => (
                        <option key={team.code} value={team.code}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6">
          <label htmlFor="grouppick-name" className="text-sm font-semibold">
            숲(SOOP) 아이디
          </label>
          <p className="mt-1 text-xs text-slate-400">
            닉네임이 아니라 로그인용 아이디를 적어 주세요. 아이디는 중복이 없어서 당첨 확인에 씁니다.
          </p>
          <input
            id="grouppick-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            placeholder="숲 로그인 아이디 (영문·숫자)"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        {/* 봇 방지용 미끼 — 사람 눈엔 안 보이고, 채워져 오면 서버가 거부한다 */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(event) => setHp(event.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-xl bg-[#2563EB] px-4 py-4 text-base font-bold text-white disabled:bg-slate-300"
        >
          {sending ? "제출 중…" : filled ? "예측 제출" : "12팀을 모두 배치해 주세요"}
        </button>
        <p className="mt-3 pb-10 text-xs text-slate-400">
          같은 아이디로 다시 제출하면 마지막 예측만 집계됩니다.
        </p>
      </div>
    </main>
  );
}
