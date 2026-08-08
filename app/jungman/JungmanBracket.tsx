import Image from "next/image";

import { JUNGMAN_TOURNAMENT, jungmanLogoPath, jungmanTeamByName } from "@/lib/jungman";
import type { JungmanStandingsMatch } from "@/lib/jungman-standings";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

/** 토너먼트 색 — 달력의 토너먼트 카드와 같은 금색이어야 같은 것으로 읽힌다 */
const GOLD = "#d4a94a";
const MUTED = "#7a8299";

const MATCH_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "2026-09-03" → "9/3(목)". ko-KR은 "9. 3. (목)"으로 뱉어서 조각을 직접 조립한다. */
function formatMatchDate(date: string): string {
  const parts = MATCH_DATE.formatToParts(new Date(`${date}T00:00:00+09:00`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** 아직 안 정해진 자리는 이름도 로고도 없다 — 빈칸 대신 '미정'이라고 말한다 */
function Side({ name, sets, lost }: { name?: string; sets?: number; lost?: boolean }) {
  if (!name) {
    return <span className="text-sm font-bold text-[#7a8299]">미정</span>;
  }
  const code = jungmanTeamByName(name)?.code;
  const tone = lost ? "text-[#7a8299]" : "text-[#e8ebf2]";
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {code ? (
        <Image
          src={jungmanLogoPath(code)}
          alt=""
          width={32}
          height={32}
          className={`h-6 w-6 shrink-0 object-contain ${lost ? "opacity-50" : ""}`}
        />
      ) : null}
      <span className={`truncate text-sm font-black ${tone}`}>{name}</span>
      {sets === undefined ? null : (
        <span className={`ml-auto shrink-0 text-sm font-black tabular-nums ${tone}`}>{sets}</span>
      )}
    </span>
  );
}

/**
 * 8강 · 4강 · 결승 대진표.
 *
 * 구조(경기 수·날짜)는 JUNGMAN_TOURNAMENT가, 대진과 결과는 저장된 경기가 준다.
 * 두 쪽을 잇는 열쇠는 라운드 이름(group) + 날짜다 — 관리자도 같은 열쇠로 저장한다.
 * 토너먼트 경기가 하나도 없으면(조별리그 진행 중) 아무것도 그리지 않는다.
 */
export default function JungmanBracket({ matches }: { matches: JungmanStandingsMatch[] }) {
  const games = JUNGMAN_TOURNAMENT.map((round) => ({
    ...round,
    match: matches.find((m) => m.group === round.round && m.date === round.date),
  }));

  // 대진이 하나도 안 나왔으면 '미정' 일곱 칸짜리 빈 표다 — 달력이 이미 그 날짜를 말한다
  if (!games.some((game) => game.match)) return null;

  // 라운드 열은 상수 순서 그대로 — 여기에 또 적으면 라운드가 늘 때 조용히 어긋난다
  const rounds = [...new Set(JUNGMAN_TOURNAMENT.map((round) => round.round))];

  return (
    <div className="mt-3 md:mt-4">
      <h2 className="mb-2 px-1 text-base font-black tracking-tight md:mb-3 md:text-xl">대진표</h2>
      {/* 좁은 화면에서는 세로로 쌓인다 — 세 열을 억지로 밀어넣으면 팀 이름이 다 잘린다 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {rounds.map((round) => (
          <div key={round} className={`${PANEL} p-3 md:p-4`}>
            <p className="mb-2 text-sm font-black" style={{ color: GOLD }}>
              {round}
            </p>
            <ul className="flex flex-col gap-2">
              {games
                .filter((game) => game.round === round)
                .map((game) => {
                  const match = game.match;
                  // 끝난 경기만 점수를 갖는다 — 예정 경기의 0:0을 그리면 결과처럼 읽힌다
                  const score = match?.decided ? { home: match.homeSets, away: match.awaySets } : null;
                  return (
                    <li
                      key={game.date}
                      className="rounded-xl border-l-2 bg-[rgba(155,185,240,0.06)] px-2.5 py-2"
                      style={{ borderColor: match ? GOLD : MUTED }}
                    >
                      <p className="text-[0.6875rem] font-bold tabular-nums text-[#7a8299]">
                        {formatMatchDate(game.date)}
                      </p>
                      <div className="mt-1 flex flex-col gap-1">
                        <Side
                          name={match?.home}
                          sets={score?.home}
                          lost={score ? score.home < score.away : false}
                        />
                        <Side
                          name={match?.away}
                          sets={score?.away}
                          lost={score ? score.away < score.home : false}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
