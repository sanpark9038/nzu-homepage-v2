"use client";

import { useEffect, useMemo, useState } from "react";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import {
  JUNGMAN_MATCH_TIME,
  JUNGMAN_TEAMS,
  JUNGMAN_TOURNAMENT,
  jungmanHandicap,
} from "@/lib/jungman";
import { setScoreOf, type JungmanStandingsMatch, type JungmanStandingsSet } from "@/lib/jungman-standings";
import { raceOfName, type RaceLookupPlayer } from "@/lib/overlay-race";
import { DEFAULT_MAPS } from "@/lib/overlay-types";

/**
 * 조별 순위 입력.
 *
 * 3팀 조는 경기 조합이 3개로 정해져 있다. 조마다 경기 슬롯을 미리 깔아두고
 * 세트 승자만 누르게 한다 — 점수를 넣는 길은 그것 하나뿐이다.
 * 토너먼트(8강·4강·결승)는 조가 없다. group 칸에 라운드 이름을 넣어 같은 matches 배열에 산다 —
 * 순위표·경우의 수는 조 이름만 보므로 저절로 빠지고, 일정·경기 결과에는 저절로 섞인다.
 * 원문 JSON 편집은 아래 토글로 그대로 남겨둔다 (스키마를 벗어나는 손질이 필요할 때가 있다).
 */

type Group = { name: string; teams: string[] };
type MatchSet = JungmanStandingsSet;
/** decided는 파서가 점수에서 계산하는 값이다 — 저장 JSON에 적으면 점수와 어긋날 수 있다 */
type Match = Omit<JungmanStandingsMatch, "decided">;
type Standings = { announced: boolean; groups: Group[]; matches: Match[] };
type Player = RaceLookupPlayer & { university: string | null };

const MAP_LIST_ID = "jungman-map-list";

/** 팀 약칭 비교용 — `N.C.S`와 `NCS`가 같아야 한다 */
const norm = (s: string) => s.toUpperCase().replace(/[^0-9A-Z가-힣]/g, "");

// 2026 K-중만컵 확정 편성 (2026-08-03 조지명식)
const PRESET_2026: Group[] = [
  { name: "A조", teams: ["캄몬스타즈", "HM", "엠비대"] },
  { name: "B조", teams: ["뉴캣슬", "BGM", "JSA"] },
  { name: "C조", teams: ["케이대", "와플대", "DM"] },
  { name: "D조", teams: ["수술대", "신세계", "흑카데미"] },
];

// 2026 K-중만컵 조별리그 공식 일정 (전 경기 19:00)
const SCHEDULE_2026: { date: string; group: string; home: string; away: string }[] = [
  { date: "2026-08-08", group: "A조", home: "캄몬스타즈", away: "엠비대" },
  { date: "2026-08-09", group: "C조", home: "와플대", away: "DM" },
  { date: "2026-08-13", group: "D조", home: "수술대", away: "신세계" },
  { date: "2026-08-14", group: "B조", home: "뉴캣슬", away: "BGM" },
  { date: "2026-08-15", group: "C조", home: "케이대", away: "와플대" },
  { date: "2026-08-16", group: "A조", home: "캄몬스타즈", away: "HM" },
  { date: "2026-08-20", group: "D조", home: "수술대", away: "흑카데미" },
  { date: "2026-08-21", group: "B조", home: "뉴캣슬", away: "JSA" },
  { date: "2026-08-22", group: "C조", home: "케이대", away: "DM" },
  { date: "2026-08-23", group: "A조", home: "HM", away: "엠비대" },
  { date: "2026-08-27", group: "D조", home: "신세계", away: "흑카데미" },
  { date: "2026-08-28", group: "B조", home: "BGM", away: "JSA" },
];

// ko-KR 기본 조립은 "8월 8일 (토)"라 조각으로 다시 짠다
const DATE_PARTS = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "8/8(토)" — 정오 기준으로 읽어 시간대 때문에 하루 밀리는 일을 막는다 */
function dayLabel(date: string) {
  const parts = DATE_PARTS.formatToParts(new Date(`${date}T12:00:00+09:00`));
  const of = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${of("month")}/${of("day")}(${of("weekday")})`;
}

const EMPTY: Standings = { announced: true, groups: [], matches: [] };

/** JSON 왕복(직접 편집 토글)에서 세트가 증발하지 않게 그대로 통과시킨다. 엄격한 검사는 파서가 한다. */
function parseSets(value: unknown): MatchSet[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sets = value.map((s: Partial<MatchSet>) => ({
    map: String(s?.map ?? ""),
    home: String(s?.home ?? ""),
    away: String(s?.away ?? ""),
    winner: s?.winner === "home" ? ("home" as const) : s?.winner === "away" ? ("away" as const) : null,
  }));
  return sets.length ? sets : undefined;
}

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
            sets: parseSets(m?.sets),
            date: typeof m?.date === "string" ? m.date : undefined,
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

/** 홈/원정이 뒤집혀 저장돼 있어도 같은 경기로 본다 */
const isPair = (m: Match, group: string, a: string, b: string) =>
  m.group === group && ((m.home === a && m.away === b) || (m.home === b && m.away === a));

/**
 * 토너먼트 경기는 라운드(group) + 날짜로 찾는다 — 대진이 아직 비어 있을 수 있어 팀으로는 못 찾는다.
 * JUNGMAN_TOURNAMENT의 날짜가 전부 달라서 이 조합 하나로 7경기가 유일하게 갈린다.
 */
const isRound = (m: Match, round: string, date: string) => m.group === round && m.date === date;

/** 저장 방향이 화면과 반대일 때 세트도 같이 뒤집어야 왼쪽 칸이 계속 왼쪽 팀 선수다 */
const flipSets = (sets?: MatchSet[]): MatchSet[] | undefined =>
  sets?.map((s) => ({
    map: s.map,
    home: s.away,
    away: s.home,
    winner: s.winner === "home" ? "away" : s.winner === "away" ? "home" : null,
  }));

const EMPTY_SET: MatchSet = { map: "", home: "", away: "", winner: null };

// 전 경기 9전 5선승
const SETS_PER_MATCH = 9;

/** 맵·선수·승자가 하나라도 있으면 실제로 쓰인 세트다. 저장 직전 걸러내기와 개수 세기에만 쓴다. */
const isFilled = (s: MatchSet) => Boolean(s.map || s.home || s.away || s.winner);

/** 채운 세트가 있으면 점수는 세트에서 계산한 값이 진짜다 (파서와 같은 규칙) */
const scoreOf = (m: Match) =>
  m.sets?.some(isFilled) ? setScoreOf(m.sets) : { home: m.homeSets, away: m.awaySets };

/**
 * 버릴 경기 = 날짜도 없고 · 채운 세트도 없고 · 점수도 0:0.
 * 날짜만 찍은 예정 경기는 살아남아야 한다. 기준이 흩어지면 또 어긋나므로 이 한 곳만 본다.
 */
const isBlank = (m: Match) => !m.date && !m.sets?.some(isFilled) && !m.homeSets && !m.awaySets;

const TXT =
  "h-10 w-28 rounded-lg border border-white/12 bg-background px-2 text-sm font-bold text-white " +
  "placeholder:text-white/25 focus:border-nzu-green focus:outline-none";

/** 토너먼트 대진 고르는 칸 */
const SEL =
  "h-10 w-32 rounded-lg border border-white/12 bg-background px-2 text-sm font-black text-white " +
  "focus:border-nzu-green focus:outline-none";

/**
 * 이름이 선수 DB에 이어졌는지 보여준다 — 종족 글자가 뜨면 연결된 것.
 * 선수 DB를 못 읽었으면 아무 판정도 하지 않는다(멀쩡한 이름에 경고가 붙으면 안 된다).
 */
function NameCheck({ players, name }: { players: Player[]; name: string }) {
  const race = players.length && name.trim() ? raceOfName(players, name) : undefined;
  if (race) return <RaceLetterBadge race={race} size="sm" />;
  return (
    <span className="w-6 shrink-0 text-center text-sm font-black text-amber-400">
      {players.length && name.trim() ? <span title="명단에 없는 이름입니다">⚠</span> : null}
    </span>
  );
}

/**
 * 세트 편집기 — 조별리그와 토너먼트가 같은 것을 쓴다. 두 벌로 적으면 조용히 어긋난다.
 * 줄 목록(빈 슬롯 포함)은 부모가 만들어 넘긴다.
 */
function SetEditor({
  home,
  away,
  date,
  sets,
  players,
  homeList,
  awayList,
  onEdit,
}: {
  home: string;
  away: string;
  date?: string;
  sets: MatchSet[];
  players: Player[];
  homeList: string;
  awayList: string;
  onEdit: (index: number, patch: Partial<MatchSet>) => void;
}) {
  // 패널티로 먼저 주는 세트는 사이트가 앎는다 — 여기서 또 넣으면 두 번 세진다
  // 날짜를 넘겨야 패널티 전에 치른 경기에 잘못 안내하지 않는다
  const handicap = jungmanHandicap(home, away, date);
  const headStart = handicap.home > 0 ? home : handicap.away > 0 ? away : null;

  return (
    <div className="mt-1 space-y-1 border-t border-white/5 pt-2">
      {headStart ? (
        <p className="rounded bg-[#e0574a]/10 px-2 py-1 text-[0.7rem] font-bold text-[#e0574a]">
          패널티 경기 — {headStart}가 1세트를 먼저 갖고 시작합니다. 그 세트는 사이트가 앎으니{" "}
          <b className="text-white/75">실제로 치른 세트만</b> 넣으세요.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-black text-white/35">
        <span className="w-5" />
        <span className="w-28">{home}</span>
        <span className="w-6" />
        <span className="w-28">맵</span>
        <span className="w-28">{away}</span>
      </div>
      {sets.map((set, i) => (
        // 세트는 순서가 곧 신원이라 index를 key로 쓴다 (정렬 기능 없음)
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-5 text-right text-xs font-bold text-white/30">{i + 1}</span>
          <input
            list={homeList}
            value={set.home}
            onChange={(e) => onEdit(i, { home: e.target.value })}
            placeholder="선수"
            className={TXT}
            aria-label={`${i + 1}세트 ${home} 선수`}
          />
          <NameCheck players={players} name={set.home} />
          <input
            list={MAP_LIST_ID}
            value={set.map}
            onChange={(e) => onEdit(i, { map: e.target.value })}
            placeholder="맵"
            className={TXT}
            aria-label={`${i + 1}세트 맵`}
          />
          <input
            list={awayList}
            value={set.away}
            onChange={(e) => onEdit(i, { away: e.target.value })}
            placeholder="선수"
            className={TXT}
            aria-label={`${i + 1}세트 ${away} 선수`}
          />
          <NameCheck players={players} name={set.away} />
          {(["home", "away"] as const).map((side) => (
            <button
              key={side}
              // 같은 버튼을 다시 누르면 해제 = 진행 중
              onClick={() => onEdit(i, { winner: set.winner === side ? null : side })}
              className={`h-10 rounded-lg px-3 text-xs font-black ${
                set.winner === side ? "bg-nzu-green text-black" : "border border-white/15 text-white/50"
              }`}
            >
              {side === "home" ? "좌승" : "우승"}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function JungmanStandingsAdmin({ initialValue }: { initialValue: string }) {
  const [data, setData] = useState<Standings>(() => parse(initialValue));
  const [raw, setRaw] = useState(initialValue);
  const [showRaw, setShowRaw] = useState(false);
  // 경기당 세트가 9개까지 붙는다 — 기본은 접어둔다
  const [openSets, setOpenSets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 선수 DB — 이름 추천 목록과 종족 확인용. 못 읽으면 빈 배열로 남아 판정 자체를 안 한다.
  const [playerDb, setPlayerDb] = useState<Player[]>([]);
  useEffect(() => {
    fetch("/api/players")
      .then((r) => r.json())
      .then((p) => {
        if (p.ok)
          setPlayerDb(
            p.players.map((x: { name: string; nickname?: string | null; race: string; university?: string | null }) => ({
              name: x.name,
              nickname: x.nickname ?? null,
              race: x.race,
              university: x.university ?? null,
            }))
          );
      })
      .catch(() => {});
  }, []);

  // 팀 이름·약칭 → 그 팀 선수 이름 목록. DB의 university가 팀 약칭이라 aliases로 맞춘다.
  const rosters = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const team of JUNGMAN_TEAMS) {
      const keys = [team.name, ...team.aliases].map(norm);
      const roster = playerDb.filter((p) => p.university && keys.includes(norm(p.university))).map((p) => p.name);
      for (const key of keys) out.set(key, roster);
    }
    return out;
  }, [playerDb]);

  // datalist는 팀마다 하나만 만든다 — 세트 줄마다 만들면 200개가 넘는다
  const teamNames = useMemo(() => [...new Set(data.groups.flatMap((g) => g.teams))], [data.groups]);
  const listIdOf = (team: string) => `jungman-roster-${teamNames.indexOf(team)}`;

  // 대진별 점수·세트를 빠르게 찾기 위한 색인. 홈/원정이 뒤집혀 저장돼 있어도 찾는다.
  const scores = useMemo(() => {
    const m = new Map<string, { home: number; away: number; sets?: MatchSet[]; date?: string }>();
    data.matches.forEach((x) => {
      const s = scoreOf(x);
      // 날짜는 방향과 무관하다 — 뒤집힌 색인에도 그대로 실어야 화면이 읽는다
      m.set(keyOf(x.group, x.home, x.away), { ...s, sets: x.sets, date: x.date });
      m.set(keyOf(x.group, x.away, x.home), { home: s.away, away: s.home, sets: flipSets(x.sets), date: x.date });
    });
    return m;
  }, [data.matches]);

  /**
   * 세트 목록을 통째로 갈아끼운다. 점수는 늘 세트에서 다시 계산한다.
   * round 날짜를 주면 그 경기를 라운드+날짜로 찾는다(토너먼트) — 대진이 바뀌어도 같은 경기다.
   */
  function setSets(group: string, home: string, away: string, sets: MatchSet[], roundDate?: string) {
    setData((prev) => {
      const same = (m: Match) =>
        roundDate ? isRound(m, group, roundDate) : isPair(m, group, home, away);
      const prior = prev.matches.find(same);
      const rest = prev.matches.filter((m) => !same(m));
      const score = setScoreOf(sets);
      const date = roundDate ?? prior?.date;
      // 빈 줄만 남으면 sets를 떼고 계산된 점수만 남긴다 — 빈 줄 9개가 JSON에 들어가면 안 된다.
      // 경기를 통째로 갈아끼우므로 기존 날짜는 손으로 챙겨 와야 한다.
      const base: Match = { group, home, away, homeSets: score.home, awaySets: score.away, ...(date ? { date } : {}) };
      const next: Match = sets.some(isFilled) ? { ...base, sets } : base;
      return { ...prev, matches: isBlank(next) ? rest : [...rest, next] };
    });
  }

  /** 토너먼트 한 줄의 두 팀. 둘 다 비면 그 경기를 통째로 지운다 — 빈 줄을 저장하지 않는다 */
  function setRoundTeam(round: string, date: string, side: "home" | "away", team: string) {
    setData((prev) => {
      const prior = prev.matches.find((m) => isRound(m, round, date));
      const rest = prev.matches.filter((m) => !isRound(m, round, date));
      const base: Match = prior ?? { group: round, home: "", away: "", homeSets: 0, awaySets: 0, date };
      const next: Match = side === "home" ? { ...base, home: team } : { ...base, away: team };
      return { ...prev, matches: next.home || next.away ? [...rest, next] : rest };
    });
  }

  /** 날짜만 고친다 — 기존 경기를 그대로 두고 date만 얹어야 세트를 잃지 않는다 */
  function setMatchDate(group: string, home: string, away: string, date: string) {
    setData((prev) => {
      const prior = prev.matches.find((m) => isPair(m, group, home, away));
      const rest = prev.matches.filter((m) => !isPair(m, group, home, away));
      // 저장 방향은 건드리지 않는다 — 뒤집혀 저장돼 있으면 그대로 둔다
      const next: Match = { ...(prior ?? { group, home, away, homeSets: 0, awaySets: 0 }) };
      if (date) next.date = date;
      else delete next.date;
      return { ...prev, matches: isBlank(next) ? rest : [...rest, next] };
    });
  }

  /** 공식 일정을 날짜 칸에만 얹는다. 이미 넣은 점수·세트는 건드리지 않는다. */
  function fillSchedule() {
    setData((prev) => {
      const matches = prev.matches.slice();
      for (const s of SCHEDULE_2026) {
        // 홈/원정이 반대로 저장돼 있어도 같은 경기다 — 새로 만들면 입력한 결과가 유령이 된다
        const at = matches.findIndex((m) => isPair(m, s.group, s.home, s.away));
        if (at >= 0) matches[at] = { ...matches[at], date: s.date };
        else matches.push({ group: s.group, home: s.home, away: s.away, homeSets: 0, awaySets: 0, date: s.date });
      }
      return { ...prev, matches };
    });
    setMessage(`${SCHEDULE_2026.length}경기 일정을 채웠습니다. 저장 버튼을 눌러야 반영됩니다.`);
  }

  /** 화면에 깔린 줄(빈 슬롯 포함)을 그대로 받아 한 칸만 고친다 */
  function editSet(
    group: string,
    home: string,
    away: string,
    cur: MatchSet[],
    index: number,
    patch: Partial<MatchSet>,
    roundDate?: string
  ) {
    setSets(group, home, away, cur.map((s, i) => (i === index ? { ...s, ...patch } : s)), roundDate);
  }

  function toJSON(d: Standings) {
    // 저장 직전에 빈 줄을 턴다 — 화면에서 안 채운 슬롯이 JSON에 남으면 안 된다
    const matches = d.matches
      .map((m) => {
        const sets = m.sets?.filter(isFilled);
        return sets?.length ? { ...m, sets } : { ...m, sets: undefined };
      })
      .filter((m) => !isBlank(m));
    return JSON.stringify({ ...d, matches }, null, 2);
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

  // 조별리그 진행률이다 — 토너먼트 경기가 섞이면 "13 / 12"가 된다
  const played = data.matches.filter(
    (m) => m.homeSets !== m.awaySets && data.groups.some((g) => g.name === m.group)
  ).length;
  const total = data.groups.reduce((a, g) => a + pairsOf(g).length, 0);

  const NUM = "w-10 text-center text-2xl font-black tabular-nums text-white";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-card p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-black tracking-tight text-white">조별 순위 입력</h2>
        <span className="text-sm font-bold text-white/50">
          {total ? `${played} / ${total} 경기 입력됨` : "조 편성을 먼저 채우세요"}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/55">
        세트마다 <b className="text-white/75">이긴 쪽을 누르면</b> 점수가 매겨집니다. 선수·맵은 몰라도 됩니다.
        저장하면 /jungman에 반영됩니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {data.groups.length === 0 ? (
          <button
            onClick={() => setData({ announced: true, groups: PRESET_2026, matches: [] })}
            className="inline-flex min-h-11 items-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black"
          >
            2026 K-중만컵 조 편성 채우기
          </button>
        ) : null}
        <button
          onClick={fillSchedule}
          className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white"
        >
          2026 조별리그 일정 채우기 ({SCHEDULE_2026.length}경기)
        </button>
      </div>

      {/* 맵 추천 목록. 목록에 없는 맵도 그냥 칠 수 있다 */}
      <datalist id={MAP_LIST_ID}>
        {DEFAULT_MAPS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {/* 팀별 선수 추천 목록. 용병·신규가 있으니 목록 밖 이름도 그냥 칠 수 있다 */}
      {teamNames.map((team) => (
        <datalist key={team} id={listIdOf(team)}>
          {(rosters.get(norm(team)) ?? []).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      ))}

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
                const mkey = keyOf(g.name, home, away);
                const open = openSets[mkey] ?? false;
                // 언제나 최소 9줄. 저장된 게 더 많으면(재경기 등) 그만큼 다 보여준다.
                const stored = s?.sets ?? [];
                const rows = Math.max(SETS_PER_MATCH, stored.length);
                const sets = Array.from({ length: rows }, (_, i) => stored[i] ?? { ...EMPTY_SET });
                const filled = sets.filter(isFilled).length;
                return (
                  <div key={`${home}-${away}`} className="rounded-xl border border-white/5 px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`min-w-[7rem] text-right text-base font-black ${
                          done && s.home > s.away ? "text-white" : "text-white/45"
                        }`}
                      >
                        {home}
                      </span>
                      <span className={NUM} aria-label={`${home} 세트 수`}>
                        {s?.home ?? 0}
                      </span>
                      <span className="text-white/30">:</span>
                      <span className={NUM} aria-label={`${away} 세트 수`}>
                        {s?.away ?? 0}
                      </span>
                      <span
                        className={`min-w-[7rem] text-base font-black ${
                          done && s.away > s.home ? "text-white" : "text-white/45"
                        }`}
                      >
                        {away}
                      </span>
                      {done ? null : s?.date ? (
                        <span className="text-xs font-black text-nzu-green">
                          예정 {dayLabel(s.date)} {JUNGMAN_MATCH_TIME}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-white/35">미진행</span>
                      )}
                      <input
                        type="date"
                        value={s?.date ?? ""}
                        onChange={(e) => setMatchDate(g.name, home, away, e.target.value)}
                        className="h-10 rounded-lg border border-white/12 bg-background px-2 text-sm font-bold text-white/70 focus:border-nzu-green focus:outline-none"
                        aria-label={`${home} vs ${away} 경기 날짜`}
                      />

                    </div>

                    <button
                      onClick={() => setOpenSets((prev) => ({ ...prev, [mkey]: !open }))}
                      className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-black text-white/50 hover:text-white"
                    >
                      <span>{open ? "▾" : "▸"}</span>
                      {`세트 ${filled}/${rows}`}
                    </button>

                    {open ? (
                      <SetEditor
                        home={home}
                        away={away}
                        date={s?.date}
                        sets={sets}
                        players={playerDb}
                        homeList={listIdOf(home)}
                        awayList={listIdOf(away)}
                        onEdit={(i, patch) => editSet(g.name, home, away, sets, i, patch)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 토너먼트 — 대회 구조가 정해져 있어 관리자가 경기를 더하거나 지우지 않는다.
          대진만 조별리그가 끝나야 나오므로 두 팀 고르는 칸을 비워둔다.
          경기를 찾는 열쇠는 라운드 + 날짜다 — 대진을 바꿔도 같은 줄이어야 한다 */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-background/60 p-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-lg font-black text-[#d4a94a]">토너먼트</h3>
          <span className="text-xs font-bold text-white/40">
            두 팀을 고르면 세트를 입력할 수 있습니다 · 대진이 아직이면 비워두세요
          </span>
        </div>
        <div className="space-y-2">
          {JUNGMAN_TOURNAMENT.map((round) => {
            const match = data.matches.find((m) => isRound(m, round.round, round.date));
            const s = match ? scoreOf(match) : { home: 0, away: 0 };
            const done = s.home !== s.away;
            const home = match?.home ?? "";
            const away = match?.away ?? "";
            const mkey = `${round.round}|${round.date}`;
            const open = openSets[mkey] ?? false;
            // 조별리그와 같은 규칙 — 언제나 최소 9줄, 저장된 게 더 많으면 그만큼 다 보여준다
            const stored = match?.sets ?? [];
            const rows = Math.max(SETS_PER_MATCH, stored.length);
            const sets = Array.from({ length: rows }, (_, i) => stored[i] ?? { ...EMPTY_SET });
            const filled = sets.filter(isFilled).length;
            return (
              <div key={mkey} className="rounded-xl border border-white/5 px-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[5.5rem] text-sm font-black text-[#d4a94a]">{round.label}</span>
                  <span className="min-w-[6rem] text-xs font-bold text-white/40">
                    {dayLabel(round.date)} {round.round === "결승" ? "" : JUNGMAN_MATCH_TIME}
                  </span>
                  <select
                    value={home}
                    onChange={(e) => setRoundTeam(round.round, round.date, "home", e.target.value)}
                    className={SEL}
                    aria-label={`${round.label} 왼쪽 팀`}
                  >
                    <option value="">미정</option>
                    {teamNames.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                  <span className={NUM} aria-label={`${round.label} 왼쪽 세트 수`}>
                    {s.home}
                  </span>
                  <span className="text-white/30">:</span>
                  <span className={NUM} aria-label={`${round.label} 오른쪽 세트 수`}>
                    {s.away}
                  </span>
                  <select
                    value={away}
                    onChange={(e) => setRoundTeam(round.round, round.date, "away", e.target.value)}
                    className={SEL}
                    aria-label={`${round.label} 오른쪽 팀`}
                  >
                    <option value="">미정</option>
                    {teamNames.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                  {done ? (
                    <span className="text-xs font-black text-white/60">
                      {s.home > s.away ? home : away} 승
                    </span>
                  ) : null}
                </div>

                {/* 세트는 두 팀이 정해진 뒤에만 — 미정 vs 미정에 선수를 적을 수는 없다 */}
                {home && away ? (
                  <>
                    <button
                      onClick={() => setOpenSets((prev) => ({ ...prev, [mkey]: !open }))}
                      className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-black text-white/50 hover:text-white"
                    >
                      <span>{open ? "▾" : "▸"}</span>
                      {`세트 ${filled}/${rows}`}
                    </button>
                    {open ? (
                      <SetEditor
                        home={home}
                        away={away}
                        date={round.date}
                        sets={sets}
                        players={playerDb}
                        homeList={listIdOf(home)}
                        awayList={listIdOf(away)}
                        onEdit={(i, patch) =>
                          editSet(round.round, home, away, sets, i, patch, round.date)
                        }
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
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
