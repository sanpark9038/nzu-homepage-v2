"use client";

import { useState } from "react";
import { GROUPS, TEAMS, teamName, type GroupKey } from "../teams";

type Entry = { name: string; at: string; groups: Record<string, string[]> };

const SLOTS = [0, 1, 2] as const;
const EMPTY: Record<GroupKey, [string, string, string]> = {
  A: ["", "", ""],
  B: ["", "", ""],
  C: ["", "", ""],
  D: ["", "", ""],
};

/** 조 하나의 팀 3개를 순서 무관하게 비교하기 위한 키 */
const setKey = (codes: string[]) => [...codes].sort().join(",");

export function WinnerChecker({ entries }: { entries: Entry[] }) {
  const [answer, setAnswer] = useState(EMPTY);

  const taken = new Set(GROUPS.flatMap((g) => answer[g]).filter(Boolean));
  const ready = GROUPS.every((g) => answer[g].every(Boolean));

  function setSlot(group: GroupKey, slot: (typeof SLOTS)[number], code: string) {
    setAnswer((prev) => {
      const next = { ...prev, [group]: [...prev[group]] as [string, string, string] };
      next[group][slot] = code;
      return next;
    });
  }

  // 제출별 일치 조 수 — 조 라벨(A/B/C/D)은 유효하고, 조 안의 순서만 무시한다
  const scored = ready
    ? entries.map((entry) => ({
        entry,
        matched: GROUPS.filter(
          (g) => setKey(entry.groups[g] ?? []) === setKey(answer[g])
        ).length,
      }))
    : [];
  const winners = scored.filter((s) => s.matched === 4);
  const histogram = [4, 3, 2, 1, 0].map((n) => ({
    n,
    count: scored.filter((s) => s.matched === n).length,
  }));

  return (
    <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer text-lg font-bold">당첨자 대조</summary>
      <p className="mt-2 text-sm text-slate-500">
        실제 조편성(정답)을 그대로 입력하면 완전 일치한 제출자를 즉시 뽑아냅니다. 조 안의 순서는
        상관없습니다.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <section key={group} className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-sm font-bold text-blue-700">{group}조</h3>
            <div className="mt-2 space-y-2">
              {SLOTS.map((slot) => (
                <select
                  key={slot}
                  aria-label={`정답 ${group}조 ${slot + 1}번 팀`}
                  value={answer[group][slot]}
                  onChange={(event) => setSlot(group, slot, event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">팀 선택</option>
                  {TEAMS.filter(
                    (team) => !taken.has(team.code) || team.code === answer[group][slot]
                  ).map((team) => (
                    <option key={team.code} value={team.code}>
                      {team.name}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!ready ? (
        <p className="mt-4 text-sm text-slate-400">12팀을 모두 채우면 자동으로 대조합니다.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="font-bold">
              완전 일치 {winners.length}명 <span className="text-slate-400">/ {entries.length}명</span>
            </h3>
            {winners.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">4개 조를 모두 맞힌 사람이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {winners.map(({ entry }, index) => (
                  <li
                    key={index}
                    className="flex justify-between gap-3 rounded-lg border-2 border-blue-600 bg-blue-50 p-3 text-sm"
                  >
                    <span className="font-bold text-blue-800">{entry.name}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(entry.at).toLocaleString("ko-KR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold">일치 조 수별 인원</h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {histogram.map(({ n, count }) => (
                <li key={n} className="rounded-lg border border-slate-200 px-3 py-2">
                  {n}조 일치 <span className="font-bold tabular-nums">{count}</span>명
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              정답: {GROUPS.map((g) => `${g}: ${answer[g].map(teamName).join(", ")}`).join(" / ")}
            </p>
          </div>
        </div>
      )}
    </details>
  );
}
