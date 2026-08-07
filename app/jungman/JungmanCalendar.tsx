"use client";

import Image from "next/image";
import { useMemo, useState, useSyncExternalStore } from "react";

import { ASL_MATCH_TIME } from "@/lib/asl";
import {
  ASL_SCHEDULE,
  JUNGMAN_GROUP_COLORS,
  JUNGMAN_MATCH_TIME,
  JUNGMAN_TOURNAMENT,
  jungmanLogoPath,
  jungmanTeamByName,
} from "@/lib/jungman";
import type { JungmanStandingsMatch } from "@/lib/jungman-standings";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

/** 토너먼트 카드 색 — 대진 미정이라 조 색을 쓰면 거짓말이 된다 */
const GOLD = "#d4a94a";
const MUTED = "#7a8299";
/** ASL 주황 — 네비게이션의 /asl accent와 같은 계열이다 */
const ASL_ACCENT = "#fb923c";

// 격자는 한국 날짜로만 만든다 — 브라우저 시간대가 어디든 같은 칸이 나와야 한다
const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const SEOUL_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" });
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-08-08" → Date. 한국 자정 기준으로 고정해 시간대에 안 흔들리게 한다 */
const at = (date: string) => new Date(`${date}T00:00:00+09:00`);

const pad = (value: number) => String(value).padStart(2, "0");

// 오늘은 시계에서 오고 서버 렌더에는 시계가 없다. 벽시계는 구독할 외부 값이라 절대 바뀌지 않는다.
const noSubscribe = () => () => {};

/**
 * 오늘(한국 날짜). 서버 렌더에는 null이고 하이드레이션 뒤에 진짜 값이 온다 —
 * useState+useEffect로 흉내 내면 하이드레이션 불일치를 스스로 만든다(HomeHeroDeck과 같은 규칙).
 */
function useTodayKST(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => SEOUL_YMD.format(new Date()),
    () => null
  );
}

/** 주말만 옅게 갈라 본다 — 토요일 파랑, 일요일 붉은색 (조 색과 같은 팔레트) */
function weekdayTone(index: number): string {
  return index === 0 ? "text-[#e0574a]" : index === 6 ? "text-[#4a9eff]" : "text-[#7a8299]";
}

/** 조 색은 이름 첫 글자로 잡는다 — 저장 순서로 잡으면 A조가 B조 색을 쓰는 날이 온다 */
function groupColor(group: string): string {
  const index = "ABCD".indexOf(group.trim().charAt(0).toUpperCase());
  return index < 0 ? MUTED : JUNGMAN_GROUP_COLORS[index];
}

type CalendarEvent = {
  date: string;
  label: string;
  color: string;
  /** 결승은 시각 미정 */
  time: string | null;
  home?: string;
  away?: string;
  /** 결과가 들어온 경기만 */
  score?: string;
  /** 남의 리그(ASL) — 이 날 왜 비는지의 설명이라 카드 배경 없이 곁들인다 */
  quiet?: boolean;
};

/** 경기 번호는 저장 데이터에 없다 — 같은 조를 날짜순으로 세어 매긴다 */
function buildGroupEvents(matches: JungmanStandingsMatch[]): CalendarEvent[] {
  const byGroup = new Map<string, JungmanStandingsMatch[]>();
  for (const match of matches) {
    if (!match.date) continue;
    const list = byGroup.get(match.group);
    if (list) list.push(match);
    else byGroup.set(match.group, [match]);
  }

  const numbers = new Map<JungmanStandingsMatch, number>();
  for (const list of byGroup.values()) {
    list.sort((a, b) => (a.date as string).localeCompare(b.date as string));
    list.forEach((match, index) => numbers.set(match, index + 1));
  }

  return matches
    .filter((match) => match.date)
    .map((match) => {
      const number = numbers.get(match);
      return {
        date: match.date as string,
        label: number ? `${match.group} ${number}경기` : match.group,
        color: groupColor(match.group),
        time: JUNGMAN_MATCH_TIME,
        home: match.home,
        away: match.away,
        ...(match.decided ? { score: `${match.homeSets} : ${match.awaySets}` } : {}),
      };
    });
}

/** 못 찾는 팀 이름(오타·외부팀)은 로고 없이 이름만 */
function TeamRow({ name }: { name: string }) {
  const code = jungmanTeamByName(name)?.code;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {code ? (
        <Image
          src={jungmanLogoPath(code)}
          alt=""
          width={24}
          height={24}
          className="h-4 w-4 shrink-0 object-contain"
        />
      ) : null}
      <span className="truncate text-[0.6875rem] font-bold text-[#e8ebf2]">{name}</span>
    </span>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <div
      className={`rounded-md border-l-2 px-1.5 py-1 ${event.quiet ? "" : "bg-[rgba(155,185,240,0.06)]"}`}
      style={{ borderColor: event.color }}
    >
      <p className="truncate text-[0.625rem] font-black" style={{ color: event.color }}>
        {event.label}
      </p>
      {/* 끝난 경기는 시각 대신 점수 — 지난 칸에서도 이 숫자는 살아 있어야 한다 */}
      {event.score || event.time ? (
        <p className="text-[0.625rem] font-bold tabular-nums text-[#7a8299]">{event.score ?? event.time}</p>
      ) : null}
      {event.home && event.away ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          <TeamRow name={event.home} />
          <TeamRow name={event.away} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * 월 달력. 목록으로는 안 보이는 것 — 월·화·수가 통째로 비는 리듬 — 을 보여주는 게 값어치다.
 * 조별리그 전체(끝난 것 + 예정)와 토너먼트 일정을 같은 격자에 올린다.
 * ASL은 그 리듬의 이유라 회색으로 곁들인다 — 우리 경기가 아니니 카드보다 흐려야 한다.
 *
 * variant="asl"이면 주인공이 뒤집힌다: /asl 페이지에서는 ASL이 컬러 카드고
 * K-중만컵이 "이 날은 남의 경기가 있다"는 회색 설명으로 내려간다. 격자·오늘·지난 칸은 그대로 공유한다.
 */
export default function JungmanCalendar({
  matches,
  variant = "jungman",
}: {
  matches: JungmanStandingsMatch[];
  variant?: "jungman" | "asl";
}) {
  const isAsl = variant === "asl";
  // Tailwind는 소스에 적힌 클래스 문자열만 본다 — 변수로 조립하면 색이 통째로 빠진다
  const accentBg = isAsl ? "bg-[#fb923c]" : "bg-[#d4a94a]";
  const accentRing = isAsl ? "ring-[#fb923c]" : "ring-[#d4a94a]";

  const { events, months } = useMemo(() => {
    const group = buildGroupEvents(matches);
    const tournament: CalendarEvent[] = JUNGMAN_TOURNAMENT.map((round) => ({
      date: round.date,
      label: round.label,
      color: GOLD,
      time: round.round === "결승" ? null : JUNGMAN_MATCH_TIME,
    }));

    if (variant === "asl") {
      // 월 탭은 ASL 일정으로 정한다 — 9월 이후는 미공개라 K-중만컵 9월분은 자연히 범위 밖이다
      const months = [...new Set(ASL_SCHEDULE.map((item) => item.date.slice(0, 7)))].sort();
      const aslEvents: CalendarEvent[] = ASL_SCHEDULE.map((item) => ({
        date: item.date,
        label: item.label,
        color: ASL_ACCENT,
        time: ASL_MATCH_TIME,
      }));
      // 남의 대회는 라벨 한 줄로 줄인다 — 팀·로고·점수까지 얹으면 주인공이 안 보인다
      const quiet: CalendarEvent[] = [...group, ...tournament]
        .filter((event) => months.includes(event.date.slice(0, 7)))
        .map((event) => ({
          date: event.date,
          label: `K-중만컵 ${event.label}`,
          color: MUTED,
          time: null,
          quiet: true,
        }));
      return { events: [...aslEvents, ...quiet], months };
    }

    // 조별리그가 하나도 없으면 그리지 않는다 — 토너먼트 라벨만 남은 달력은 빈 화면이다
    if (!group.length) return { events: [] as CalendarEvent[], months: [] as string[] };

    const all: CalendarEvent[] = [...group, ...tournament];
    // 월 탭은 우리 일정으로만 정한다 — ASL이 새 달을 만들면 K-중만컵이 하나도 없는 달이 탭에 뜬다
    const months = [...new Set(all.map((e) => e.date.slice(0, 7)))].sort();
    const asl: CalendarEvent[] = ASL_SCHEDULE.filter((item) => months.includes(item.date.slice(0, 7))).map(
      (item) => ({ date: item.date, label: item.label, color: MUTED, time: JUNGMAN_MATCH_TIME, quiet: true })
    );
    return { events: [...all, ...asl], months };
  }, [matches, variant]);

  // 오늘 테두리와 지난 칸 흐리기는 하이드레이션 뒤에 생긴다
  const today = useTodayKST();
  const [picked, setPicked] = useState<string | null>(null);

  if (!events.length) return null;

  // 처음에는 오늘이 속한 달. 서버 렌더는 시계가 없어 첫 달을 그리고 마운트 뒤 옮겨간다
  const todayMonth = today?.slice(0, 7);
  const month = picked ?? (todayMonth && months.includes(todayMonth) ? todayMonth : months[0]);

  const year = Number(month.slice(0, 4));
  const monthNo = Number(month.slice(5));
  // 말일 — 다음 달 1일에서 하루 전(한국 기준). 한국은 서머타임이 없어 뺄셈이 정확하다
  const nextMonth = monthNo === 12 ? `${year + 1}-01` : `${year}-${pad(monthNo + 1)}`;
  const lastDay = Number(SEOUL_YMD.format(at(`${nextMonth}-01`).getTime() - 86_400_000).slice(-2));
  const firstWeekday = WEEKDAY_INDEX[SEOUL_WEEKDAY.format(at(`${month}-01`))] ?? 0;

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: lastDay }, (_, index) => `${month}-${pad(index + 1)}`),
  ];

  return (
    <div className="mt-3 md:mt-4">
      <div className="mb-2 flex items-center gap-3 px-1 md:mb-3">
        <h2 className="text-base font-black tracking-tight md:text-xl">{isAsl ? "일정" : "경기 일정"}</h2>
        <div className="flex gap-1.5">
          {months.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(key)}
              className={`rounded-full px-3 py-1 text-xs font-black transition ${
                key === month
                  ? `${accentBg} text-[#0b0f1a]`
                  : "border border-[rgba(155,185,240,0.14)] text-[#7a8299] hover:text-[#e8ebf2]"
              }`}
            >
              {Number(key.slice(5))}월
            </button>
          ))}
        </div>
        {isAsl ? (
          <span className="hidden text-xs text-[#7a8299] lg:inline">
            회색은 K-중만컵 일정 · 9월 이후 ASL 일정은 공개되는 대로 갱신
          </span>
        ) : null}
      </div>

      <div className={`${PANEL} overflow-hidden p-2`}>
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((label, index) => (
            <div key={label} className={`py-1.5 text-center text-[0.6875rem] font-black ${weekdayTone(index)}`}>
              {label}
            </div>
          ))}
        </div>
        {/* gap-px + 배경색으로 칸 경계를 그린다 — 칸마다 테두리를 주면 선이 두 겹으로 겹친다 */}
        <div className="grid grid-cols-7 gap-px bg-[rgba(155,185,240,0.08)]">
          {cells.map((date, index) =>
            date === null ? (
              <div key={`blank-${index}`} className="min-h-[7.5rem] bg-[#0c1220]" />
            ) : (
              <div
                key={date}
                className={`min-h-[7.5rem] bg-[#0c1220] p-1.5 ${
                  today !== null && date < today ? "opacity-45" : ""
                } ${date === today ? `ring-1 ring-inset ${accentRing}` : ""}`}
              >
                <p className={`px-0.5 text-[0.6875rem] font-black tabular-nums ${weekdayTone(index % 7)}`}>
                  {Number(date.slice(-2))}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {(byDate.get(date) ?? []).map((event, eventIndex) => (
                    <EventCard key={eventIndex} event={event} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
