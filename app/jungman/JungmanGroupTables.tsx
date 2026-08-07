"use client";

import Image from "next/image";
import { Fragment, useState, useSyncExternalStore } from "react";

import {
  JUNGMAN_GROUP_COLORS,
  JUNGMAN_MATCH_TIME,
  jungmanLogoPath,
  jungmanTeamByName,
} from "@/lib/jungman";
import {
  JUNGMAN_ADVANCING,
  type JungmanGroupTable,
  type JungmanScenario,
  type JungmanStandingsMatch,
} from "@/lib/jungman-standings";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

// 조 2위까지 8강 진출 — 진출선을 어디에 그을지의 기준. 경우의 수 계산과 같은 상수를 본다
const ADVANCING = JUNGMAN_ADVANCING;

/** 펼쳤을 때만 보이는 한 줄. 짧은 순서대로 먼저 걸린다 */
function scenarioLine(s: JungmanScenario | undefined): string | null {
  if (!s) return null;
  if (s.clinched) return "8강 진출 확정";
  if (s.eliminated) return "탈락 확정";
  if (s.winClinches && s.lossEliminates) return "다음 경기에서 이기면 진출, 지면 탈락";
  if (s.winClinches) return "다음 경기를 이기면 진출 확정";
  if (s.lossEliminates) return "다음 경기를 지면 탈락";
  return null;
}

// ── 날짜·D-day ───────────────────────────────────────────────────────────
// TODO: JungmanSchedule·JungmanCalendar도 같은 헬퍼를 갖고 있다 — 언젠가 lib으로 합칠 자리다
const MATCH_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-08-08" → Date. 한국 자정 기준으로 고정해 시간대에 안 흔들리게 한다 */
const at = (date: string) => new Date(`${date}T00:00:00+09:00`);

/** "2026-08-08" → "8/8(토)". ko-KR은 "8. 8. (토)"으로 뱉어서 조각을 직접 조립한다. */
function formatMatchDate(date: string): string {
  const parts = MATCH_DATE.formatToParts(at(date));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** 날짜가 지났는데 결과가 안 들어온 경기는 D-day를 그리지 않는다 */
function ddayLabel(date: string, todayKST: string): string | null {
  const dday = Math.round((Date.parse(date) - Date.parse(todayKST)) / 86_400_000);
  if (dday < 0) return null;
  return dday === 0 ? "오늘" : dday === 1 ? "내일" : `D-${dday}`;
}

// 오늘은 시계에서 오고 서버 렌더에는 시계가 없다. 벽시계는 구독할 외부 값이라 절대 바뀌지 않는다.
const noSubscribe = () => () => {};

/**
 * 오늘(한국 날짜). 서버 렌더에는 null이고 하이드레이션 뒤에 진짜 값이 온다 —
 * useState+useEffect로 흉내 내면 하이드레이션 불일치를 스스로 만든다(JungmanCalendar와 같은 규칙).
 */
function useTodayKST(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => SEOUL_YMD.format(new Date()),
    () => null
  );
}

// ── 펼침 내용 ────────────────────────────────────────────────────────────
const TH = "text-right text-[0.625rem] font-bold tracking-[0.06em] text-[#7a8299] md:text-[0.6875rem]";
const NUM = "text-right font-black tabular-nums text-[#e8ebf2] text-sm md:text-lg";
const SUB = "px-1 pt-2 text-[0.625rem] font-black tracking-[0.06em] text-[#7a8299]";
/** 경기 한 줄: 날짜 · 홈 · 가운데(점수/vs) · 원정 · 꼬리(승패/D-day) */
const LINE = "grid grid-cols-[3.6rem_1fr_auto_1fr_2.4rem] items-center gap-1 py-1 md:gap-2";

/** 못 찾는 팀 이름(오타·외부팀)은 로고 없이 이름만 */
function TeamSide({ name, align, bold }: { name: string; align: "left" | "right"; bold: boolean }) {
  const code = jungmanTeamByName(name)?.code;
  const logo = code ? (
    <Image
      src={jungmanLogoPath(code)}
      alt=""
      width={24}
      height={24}
      className="hidden h-4 w-4 shrink-0 object-contain md:block"
    />
  ) : null;
  const label = (
    <span
      className={`truncate text-[0.6875rem] md:text-xs ${
        bold ? "font-black text-[#e8ebf2]" : "font-bold text-[rgba(232,235,242,0.62)]"
      }`}
    >
      {name}
    </span>
  );
  return (
    <span className={`flex min-w-0 items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" ? (
        <>
          {logo}
          {label}
        </>
      ) : (
        <>
          {label}
          {logo}
        </>
      )}
    </span>
  );
}

function MatchLine({
  match,
  team,
  today,
}: {
  match: JungmanStandingsMatch;
  team: string;
  today: string | null;
}) {
  const isHome = match.home === team;
  // 좌우는 홈·원정 자리로 고정한다 — 누른 팀을 왼쪽으로 몰면 어느 쪽이 홈인지 안 보인다
  const head = match.date ? formatMatchDate(match.date) : "일정 미정";
  const won = isHome ? match.homeSets > match.awaySets : match.awaySets > match.homeSets;
  const dday = !match.decided && match.date && today ? ddayLabel(match.date, today) : null;

  return (
    <div className={LINE}>
      <span className="truncate text-[0.625rem] font-bold tabular-nums text-[#7a8299]">
        {head}
        {!match.decided && match.date ? (
          <span className="hidden md:inline"> {JUNGMAN_MATCH_TIME}</span>
        ) : null}
      </span>
      <TeamSide name={match.home} align="right" bold={isHome} />
      {match.decided ? (
        <span className="shrink-0 text-[0.6875rem] font-black tabular-nums text-[#e8ebf2] md:text-xs">
          {match.homeSets} : {match.awaySets}
        </span>
      ) : (
        <span className="shrink-0 text-[0.5625rem] font-black text-[#7a8299]">vs</span>
      )}
      <TeamSide name={match.away} align="left" bold={!isHome} />
      {match.decided ? (
        <span
          className={`text-right text-[0.625rem] font-black ${
            won ? "text-[#2BE39B]" : "text-[rgba(232,235,242,0.34)]"
          }`}
        >
          {won ? "승" : "패"}
        </span>
      ) : (
        <span className="text-right text-[0.625rem] font-black tabular-nums text-[#d4a94a]">{dday}</span>
      )}
    </div>
  );
}

/** 날짜 오름차순. 날짜 없는 경기는 맨 뒤 */
const byDate = (a: JungmanStandingsMatch, b: JungmanStandingsMatch) =>
  (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99");

function TeamMatches({
  team,
  matches,
  today,
  line,
  color,
}: {
  team: string;
  matches: JungmanStandingsMatch[];
  today: string | null;
  /** 경우의 수 한 줄. 할 말이 없으면 null — 빈 줄을 그리지 않는다 */
  line: string | null;
  color: string;
}) {
  const mine = matches.filter((m) => m.home === team || m.away === team).sort(byDate);
  const past = mine.filter((m) => m.decided);
  const rest = mine.filter((m) => !m.decided);

  return (
    <div className="border-t border-[rgba(155,185,240,0.07)] bg-[rgba(9,14,26,0.93)] px-2 pb-2 md:px-3">
      {line ? (
        <p
          className="mt-2 border-l-[3px] bg-[rgba(155,185,240,0.06)] py-1.5 pl-2 text-[0.6875rem] font-black text-[#e8ebf2] md:text-xs"
          style={{ borderColor: color }}
        >
          {line}
        </p>
      ) : null}
      {past.length ? <p className={SUB}>지난 경기</p> : null}
      {past.map((match, index) => (
        <MatchLine key={`p${index}`} match={match} team={team} today={today} />
      ))}
      {rest.length ? <p className={SUB}>남은 경기</p> : null}
      {rest.map((match, index) => (
        <MatchLine key={`r${index}`} match={match} team={team} today={today} />
      ))}
      {mine.length ? null : <p className="px-1 py-2 text-[0.6875rem] text-[#7a8299]">경기 정보가 없습니다</p>}
    </div>
  );
}

// ── 순위표 ───────────────────────────────────────────────────────────────
/** 행 안의 알약. 확정된 것만 그린다 — 미확정에 뭔가를 붙이면 글자만 늘어난다 */
function StatusPill({ scenario }: { scenario: JungmanScenario | undefined }) {
  if (!scenario) return null;
  if (scenario.clinched)
    return (
      <span className="shrink-0 rounded-full bg-[rgba(43,227,155,0.16)] px-1.5 py-px text-[0.625rem] font-black text-[#2BE39B]">
        진출
      </span>
    );
  if (scenario.eliminated)
    return (
      <span className="shrink-0 rounded-full bg-[rgba(122,130,153,0.16)] px-1.5 py-px text-[0.625rem] font-black text-[#7a8299]">
        탈락
      </span>
    );
  return null;
}

function GroupCard({
  table,
  color,
  matches,
  scenarios,
  open,
  onToggle,
  today,
}: {
  table: JungmanGroupTable;
  color: string;
  matches: JungmanStandingsMatch[];
  scenarios: JungmanScenario[];
  open: string | null;
  onToggle: (team: string) => void;
  today: string | null;
}) {
  return (
    <section className={`${PANEL} overflow-hidden`} style={{ ["--gc" as string]: color }}>
      <header
        className="flex items-baseline gap-2 px-4 py-2.5 md:px-5 md:py-3"
        style={{ background: `linear-gradient(90deg, ${color}42, transparent 62%)` }}
      >
        <h2 className="text-base font-black tracking-tight md:text-xl" style={{ color }}>
          {table.name}
        </h2>
        <span className="text-[0.625rem] font-bold text-[#7a8299] md:text-xs">
          {table.rows.length}팀 풀리그
        </span>
      </header>

      <div className="px-3 pb-3 md:px-4 md:pb-4">
        {/* 열 이름 — 아래 각 줄과 같은 격자를 쓴다 */}
        <div className="grid grid-cols-[1fr_2.2rem_2.2rem_3rem_3.4rem_2.8rem] items-center gap-1.5 py-2 md:gap-2">
          <span className={`${TH} text-left`}>팀</span>
          <span className={TH}>승</span>
          <span className={TH}>패</span>
          <span className={TH}>세트승</span>
          <span className={TH}>세트득실</span>
          <span className={TH}>잔여</span>
        </div>

        {table.rows.map((row, index) => {
          const advancing = index < ADVANCING;
          const code = jungmanTeamByName(row.team)?.code;
          const expanded = open === row.team;
          const scenario = scenarios.find((s) => s.team === row.team);
          return (
            <Fragment key={row.team}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => onToggle(row.team)}
                className={`relative grid w-full grid-cols-[1fr_2.2rem_2.2rem_3rem_3.4rem_2.8rem] items-center gap-1.5 border-t border-[rgba(155,185,240,0.07)] py-2.5 text-left transition hover:bg-[rgba(155,185,240,0.05)] md:gap-2 md:py-3 ${
                  expanded ? "bg-[rgba(155,185,240,0.08)]" : ""
                } ${
                  index === ADVANCING - 1 ? "border-b-2 border-b-dashed border-b-[rgba(43,227,155,0.45)]" : ""
                } ${index === ADVANCING ? "border-t-0" : ""}`}
              >
                {/* 진출권 표시 — 왼쪽 세로 막대 */}
                {advancing ? (
                  <span
                    aria-hidden
                    className="absolute bottom-[18%] left-0 top-[18%] w-[3px] rounded-full"
                    style={{ background: color }}
                  />
                ) : null}

                <span className="flex min-w-0 items-center gap-2 pl-2.5 md:gap-2.5">
                  <span
                    className="w-4 shrink-0 text-center text-xs font-black tabular-nums md:text-sm"
                    style={{ color: advancing ? color : "rgba(232,235,242,0.34)" }}
                  >
                    {index + 1}
                  </span>
                  {code ? (
                    <Image
                      src={jungmanLogoPath(code)}
                      alt=""
                      width={32}
                      height={32}
                      className="h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
                    />
                  ) : null}
                  <span className="truncate text-sm font-black text-[#e8ebf2] md:text-lg">{row.team}</span>
                  <StatusPill scenario={scenario} />
                  <span aria-hidden className="shrink-0 text-[0.5rem] text-[#7a8299]">
                    {expanded ? "▲" : "▼"}
                  </span>
                </span>

                <span className={NUM}>{row.wins}</span>
                <span className={`${NUM} text-[rgba(232,235,242,0.55)]`}>{row.losses}</span>
                <span className={NUM}>{row.setsWon}</span>
                <span
                  className={`${NUM} ${
                    row.setDiff > 0 ? "text-[#2BE39B]" : row.setDiff < 0 ? "text-[#e0574a]" : ""
                  }`}
                >
                  {row.setDiff > 0 ? `+${row.setDiff}` : row.setDiff}
                </span>
                <span className="text-right text-[0.6875rem] font-bold tabular-nums text-[#7a8299] md:text-sm">
                  {row.remaining}
                </span>
              </button>

              {expanded ? (
                <TeamMatches
                  team={row.team}
                  matches={matches}
                  today={today}
                  line={scenarioLine(scenario)}
                  color={color}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

/** 조별 순위표 묶음. 조 편성 발표 전(tables가 빔)이면 안내 문구로 떨어진다. */
export default function JungmanGroupTables({
  tables,
  matches,
  scenarios,
}: {
  tables: JungmanGroupTable[];
  /** 조별리그 전체 경기(끝난 것 + 예정). 팀을 누르면 그 팀 것만 골라 보여준다 */
  matches: JungmanStandingsMatch[];
  /** 조 이름 → 팀별 진출 경우의 수 */
  scenarios: Map<string, JungmanScenario[]>;
}) {
  // 한 번에 한 팀만 — 조가 달라도 마찬가지다
  const [open, setOpen] = useState<string | null>(null);
  const today = useTodayKST();

  return tables.length ? (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {tables.map((table, i) => (
        <GroupCard
          key={table.name}
          table={table}
          color={JUNGMAN_GROUP_COLORS[i % JUNGMAN_GROUP_COLORS.length]}
          matches={matches}
          scenarios={scenarios.get(table.name) ?? []}
          open={open}
          onToggle={(team) => setOpen((current) => (current === team ? null : team))}
          today={today}
        />
      ))}
    </div>
  ) : (
    <section className={`${PANEL} px-4 py-5 md:p-6`}>
      <h2 className="text-base font-black tracking-tight md:text-xl">조 편성 발표 전입니다</h2>
      <p className="mt-2 text-xs leading-relaxed text-[#7a8299] md:text-sm">
        총 <b className="font-bold text-[#e8ebf2]">12팀</b>이 3팀씩 4개조(A~D)로 나뉘어 조별리그를 치릅니다.
        편성이 발표되면 이 화면에 조별 순위표가 올라옵니다.
      </p>
    </section>
  );
}
