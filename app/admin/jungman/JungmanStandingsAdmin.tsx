"use client";

import { useMemo, useState } from "react";

/**
 * 조별 순위 입력.
 *
 * 3팀 조는 경기 조합이 3개로 정해져 있다. 그래서 JSON을 손으로 치는 대신
 * 조마다 경기 슬롯을 미리 깔아두고 점수만 채우게 한다.
 * 원문 JSON 편집은 아래 토글로 그대로 남겨둔다 (스키마를 벗어나는 손질이 필요할 때가 있다).
 */

type Group = { name: string; teams: string[] };
type Match = { group: string; home: string; away: string; homeSets: number; awaySets: number };
type Standings = { announced: boolean; groups: Group[]; matches: Match[] };

// 2026 K-중만컵 확정 편성 (2026-08-03 조지명식)
const PRESET_2026: Group[] = [
  { name: "A조", teams: ["캄몬스타즈", "HM", "엠비대"] },
  { name: "B조", teams: ["뉴캣슬", "BGM", "JSA"] },
  { name: "C조", teams: ["케이대", "와플대", "DM"] },
  { name: "D조", teams: ["수술대", "신세계", "흑카데미"] },
];

const EMPTY: Standings = { announced: true, groups: [], matches: [] };

function parse(raw: string): Standings {
  if (!raw.trim()) return EMPTY;
  try {
    const j = JSON.parse(raw);
    return {
      announced: j.announced !== false,
      groups: Array.isArray(j.groups)
        ? j.groups.map((g: Group) => ({ name: String(g?.name ?? ""), teams: (g?.teams ?? []).map(String) }))
        : [],
      matches: Array.isArray(j.matches)
        ? j.matches.map((m: Match) => ({
            group: String(m?.group ?? ""),
            home: String(m?.home ?? ""),
            away: String(m?.away ?? ""),
            homeSets: Number(m?.homeSets ?? 0),
            awaySets: Number(m?.awaySets ?? 0),
          }))
        : [],
    };
  } catch {
    return EMPTY;
  }
}

/** 조 안에서 나올 수 있는 모든 대진 (3팀이면 3경기) */
function pairsOf(g: Group) {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < g.teams.length; i += 1)
    for (let j = i + 1; j < g.teams.length; j += 1) out.push([g.teams[i], g.teams[j]]);
  return out;
}

const keyOf = (group: string, home: string, away: string) => `${group}|${home}|${away}`;

export default function JungmanStandingsAdmin({ initialValue }: { initialValue: string }) {
  const [data, setData] = useState<Standings>(() => parse(initialValue));
  const [raw, setRaw] = useState(initialValue);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 대진별 점수를 빠르게 찾기 위한 색인. 홈/원정이 뒤집혀 저장돼 있어도 찾는다.
  const scores = useMemo(() => {
    const m = new Map<string, { home: number; away: number }>();
    data.matches.forEach((x) => {
      m.set(keyOf(x.group, x.home, x.away), { home: x.homeSets, away: x.awaySets });
      m.set(keyOf(x.group, x.away, x.home), { home: x.awaySets, away: x.homeSets });
    });
    return m;
  }, [data.matches]);

  function setScore(group: string, home: string, away: string, side: "home" | "away", value: string) {
    const n = value === "" ? null : Math.max(0, Math.min(9, Number(value) || 0));
    setData((prev) => {
      const rest = prev.matches.filter(
        (m) => !(m.group === group && ((m.home === home && m.away === away) || (m.home === away && m.away === home)))
      );
      const cur = scores.get(keyOf(group, home, away)) ?? { home: 0, away: 0 };
      const next = { home: side === "home" ? n : cur.home, away: side === "away" ? n : cur.away };
      // 양쪽이 다 비면 그 경기는 아예 지운다 = 아직 안 치른 경기
      if (next.home === null && next.away === null) return { ...prev, matches: rest };
      return {
        ...prev,
        matches: [
          ...rest,
          { group, home, away, homeSets: next.home ?? 0, awaySets: next.away ?? 0 },
        ],
      };
    });
  }

  function toJSON(d: Standings) {
    return JSON.stringify(d, null, 2);
  }

  async function save(payload: string) {
    const trimmed = payload.trim();
    if (trimmed) {
      try {
        JSON.parse(trimmed);
      } catch (error) {
        setMessage(`JSON 형식이 올바르지 않습니다 — ${error instanceof Error ? error.message : "파싱 실패"}`);
        return;
      }
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/jungman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-standings", standings: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "저장에 실패했습니다.");
      setMessage(json.message || "저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const played = data.matches.filter((m) => m.homeSets !== m.awaySets).length;
  const total = data.groups.reduce((a, g) => a + pairsOf(g).length, 0);

  const NUM =
    "h-11 w-14 rounded-lg border border-white/12 bg-background text-center text-lg font-black text-white " +
    "focus:border-nzu-green focus:outline-none";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-card p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-black tracking-tight text-white">조별 순위 입력</h2>
        <span className="text-sm font-bold text-white/50">
          {total ? `${played} / ${total} 경기 입력됨` : "조 편성을 먼저 채우세요"}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/55">
        점수만 채우면 됩니다. <b className="text-white/75">양쪽을 다 비우면</b> 아직 치르지 않은 경기(잔여)로 남습니다.
        저장하면 /jungman/standings에 그대로 반영됩니다.
      </p>

      {data.groups.length === 0 ? (
        <button
          onClick={() => setData({ announced: true, groups: PRESET_2026, matches: [] })}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black"
        >
          2026 K-중만컵 조 편성 채우기
        </button>
      ) : null}

      <div className="mt-5 space-y-4">
        {data.groups.map((g) => (
          <div key={g.name} className="rounded-2xl border border-white/10 bg-background/60 p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="text-lg font-black text-nzu-green">{g.name}</h3>
              <span className="text-xs font-bold text-white/40">{g.teams.join(" · ")}</span>
            </div>
            <div className="space-y-2">
              {pairsOf(g).map(([home, away]) => {
                const s = scores.get(keyOf(g.name, home, away));
                const done = s && s.home !== s.away;
                return (
                  <div key={`${home}-${away}`} className="flex flex-wrap items-center gap-2">
                    <span
                      className={`min-w-[7rem] text-right text-base font-black ${
                        done && s.home > s.away ? "text-white" : "text-white/45"
                      }`}
                    >
                      {home}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      inputMode="numeric"
                      value={s?.home ?? ""}
                      onChange={(e) => setScore(g.name, home, away, "home", e.target.value)}
                      className={NUM}
                      aria-label={`${home} 세트 수`}
                    />
                    <span className="text-white/30">:</span>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      inputMode="numeric"
                      value={s?.away ?? ""}
                      onChange={(e) => setScore(g.name, home, away, "away", e.target.value)}
                      className={NUM}
                      aria-label={`${away} 세트 수`}
                    />
                    <span
                      className={`min-w-[7rem] text-base font-black ${
                        done && s.away > s.home ? "text-white" : "text-white/45"
                      }`}
                    >
                      {away}
                    </span>
                    {done ? null : <span className="text-xs font-bold text-white/35">미진행</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => save(toJSON(data))}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black disabled:opacity-50"
        >
          조별 순위 저장
        </button>
        <button
          onClick={() => {
            setRaw(toJSON(data));
            setShowRaw((v) => !v);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white"
        >
          {showRaw ? "JSON 접기" : "JSON 직접 편집"}
        </button>
        {message ? <span className="text-sm font-bold text-white/70">{message}</span> : null}
      </div>

      {showRaw ? (
        <div className="mt-4">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 font-mono text-xs leading-relaxed text-white"
          />
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setData(parse(raw));
                setMessage("위 입력칸에 반영했습니다. 저장 버튼을 눌러야 반영됩니다.");
              }}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white"
            >
              입력칸으로 불러오기
            </button>
            <button
              onClick={() => save(raw)}
              disabled={loading}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white disabled:opacity-50"
            >
              JSON 그대로 저장
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
