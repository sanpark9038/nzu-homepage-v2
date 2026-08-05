import Image from "next/image";

import { JUNGMAN_GROUP_COLORS, JUNGMAN_MATCH_TIME, jungmanLogoPath, jungmanTeamByName } from "@/lib/jungman";
import type { JungmanStandingsMatch } from "@/lib/jungman-standings";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

const MATCH_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "2026-08-08" → "8/8(토)". ko-KR은 "8. 8. (토)"으로 뱉어서 조각을 직접 조립한다. */
function formatMatchDate(date: string): string {
  const parts = MATCH_DATE.formatToParts(new Date(`${date}T00:00:00+09:00`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** 조 색은 이름 첫 글자로 잡는다 — 저장 순서로 잡으면 A조가 B조 색을 쓰는 날이 온다 */
function groupColor(group: string): string {
  const index = "ABCD".indexOf(group.trim().charAt(0).toUpperCase());
  // 모르는 조 이름에 아무 조 색이나 붙이면 거짓말이 된다 — 무채색으로 둔다
  return index < 0 ? "#7a8299" : JUNGMAN_GROUP_COLORS[index];
}

/** 날짜가 지났는데 결과가 안 들어온 경기는 D-day를 그리지 않는다 */
function ddayLabel(date: string, todayKST: string): string | null {
  const dday = Math.round((Date.parse(date) - Date.parse(todayKST)) / 86_400_000);
  if (dday < 0) return null;
  return dday === 0 ? "오늘" : dday === 1 ? "내일" : `D-${dday}`;
}

/** 못 찾는 팀 이름(오타·외부팀)은 로고 없이 이름만 */
function TeamSide({ name, align }: { name: string; align: "left" | "right" }) {
  const code = jungmanTeamByName(name)?.code;
  const logo = code ? (
    <Image
      src={jungmanLogoPath(code)}
      alt=""
      width={32}
      height={32}
      className="h-6 w-6 shrink-0 object-contain md:h-7 md:w-7"
    />
  ) : null;
  const label = <span className="truncate text-sm font-black text-[#e8ebf2] md:text-base">{name}</span>;

  return (
    <span className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
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

/**
 * 예정 경기 일정. 거르기·정렬은 호출부(upcomingJungmanMatches)가 끝내고 온다.
 * 날짜별로 묶지 않는다 — 한 날에 한 경기뿐이라 묶으면 계단만 는다.
 */
export default function JungmanSchedule({ matches }: { matches: JungmanStandingsMatch[] }) {
  if (!matches.length) return null;

  const todayKST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="mt-3 md:mt-4">
      <h2 className="mb-2 px-1 text-base font-black tracking-tight md:mb-3 md:text-xl">경기 일정</h2>
      <ul className="flex flex-col gap-2 md:gap-2.5">
        {matches.map((match, index) => {
          const color = groupColor(match.group);
          // 가장 가까운 경기 하나만 강조한다 — 전부 강조하면 아무것도 강조가 아니다
          const next = index === 0;
          const dday = next && match.date ? ddayLabel(match.date, todayKST) : null;

          return (
            <li
              key={`${match.group}-${match.home}-${match.away}-${index}`}
              className={`${PANEL} flex items-center gap-2 px-3 py-2.5 md:gap-4 md:px-4 md:py-3`}
              style={next ? { borderColor: color, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
            >
              <span
                className="w-11 shrink-0 text-center text-xs font-black tabular-nums md:w-14 md:text-sm"
                style={{ color }}
              >
                {dday}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[0.6875rem] font-bold text-[#7a8299] md:text-xs">
                  {match.date ? (
                    <span className="tabular-nums">
                      {formatMatchDate(match.date)} {JUNGMAN_MATCH_TIME}
                    </span>
                  ) : null}
                  <span style={{ color }}>{match.group}</span>
                </p>
                {/* 좌우는 홈·원정 자리로 고정한다 — 순서가 흔들리면 소속이 안 보인다 */}
                <div className="mt-0.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3">
                  <TeamSide name={match.home} align="right" />
                  <span className="text-[0.625rem] font-black text-[#7a8299] md:text-xs">vs</span>
                  <TeamSide name={match.away} align="left" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
