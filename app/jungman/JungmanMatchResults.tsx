import Image from "next/image";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import {
  JUNGMAN_PENALTY_NOTE,
  jungmanDateLabel,
  jungmanHandicap,
  jungmanLogoPath,
  jungmanTeamByName,
} from "@/lib/jungman";
import { type JungmanStandingsMatch, type JungmanStandingsSet } from "@/lib/jungman-standings";
import { raceOfName, type RaceLookupPlayer } from "@/lib/overlay-race";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

const DIM = "text-[rgba(232,235,242,0.42)]";

/** 못 찾는 팀 이름(오타·외부팀)은 로고 없이 이름만 — 공개 화면에 경고는 그리지 않는다 */
function TeamLogo({ team }: { team: string }) {
  const code = jungmanTeamByName(team)?.code;
  if (!code) return null;
  return (
    <Image
      src={jungmanLogoPath(code)}
      alt=""
      width={32}
      height={32}
      className="h-6 w-6 shrink-0 object-contain md:h-7 md:w-7"
    />
  );
}

/** 세트 한쪽 선수. 종족은 이름으로 찾고, 못 찾으면 배지 없이 이름만 그린다. */
function SetPlayer({
  name,
  players,
  lost,
  align,
}: {
  name: string;
  players: RaceLookupPlayer[];
  lost: boolean;
  align: "left" | "right";
}) {
  const race = name ? raceOfName(players, name) : undefined;
  const label = (
    <span className={`truncate text-xs font-bold md:text-sm ${lost ? DIM : "text-[#e8ebf2]"}`}>
      {name}
    </span>
  );
  const badge = race ? <RaceLetterBadge race={race} size="sm" className={lost ? "opacity-45" : ""} /> : null;

  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" ? (
        <>
          {label}
          {badge}
        </>
      ) : (
        <>
          {badge}
          {label}
        </>
      )}
    </span>
  );
}

const SET_GRID =
  "grid grid-cols-[1.25rem_1fr_5rem_1fr] items-center gap-1.5 md:grid-cols-[1.5rem_1fr_6.5rem_1fr] md:gap-2";

function SetRow({
  set,
  index,
  players,
}: {
  set: JungmanStandingsSet;
  index: number;
  players: RaceLookupPlayer[];
}) {
  return (
    <li className={`${SET_GRID} border-t border-[rgba(155,185,240,0.07)] py-1.5 md:py-2`}>
      <span className="text-center text-[0.625rem] font-bold tabular-nums text-[#7a8299] md:text-xs">
        {index + 1}
      </span>
      <SetPlayer name={set.home} players={players} lost={set.winner === "away"} align="right" />
      {/* 부등호 대신 가운데 맵 — 좌우가 팀 자리로 고정돼야 소속이 보인다 */}
      <span className="truncate rounded bg-[rgba(155,185,240,0.08)] px-1.5 py-0.5 text-center text-[0.625rem] font-bold text-[#7a8299] md:text-xs">
        {set.map}
      </span>
      <SetPlayer name={set.away} players={players} lost={set.winner === "home"} align="left" />
    </li>
  );
}

function MatchCard({ match, players }: { match: JungmanStandingsMatch; players: RaceLookupPlayer[] }) {
  const homeWon = match.homeSets > match.awaySets;
  // 점수에 미리 얹혀 있는 세트다 — 안 적어두면 아래 세트 수와 안 맞아 보인다
  const handicap = jungmanHandicap(match.home, match.away, match.date);
  const penalized = handicap.home > 0 || handicap.away > 0;

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <header className="flex items-center gap-2 px-4 py-2 text-[0.625rem] font-bold text-[#7a8299] md:px-5 md:text-xs">
        <span>{match.group}</span>
        {/* 날짜가 없으면 자리를 비운다 — 가짜 날짜를 만들지 않는다 */}
        {match.date ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{jungmanDateLabel(match.date)}</span>
          </>
        ) : null}
        {penalized ? (
          <>
            <span aria-hidden>·</span>
            <span className="text-[#e0574a]">{JUNGMAN_PENALTY_NOTE}</span>
          </>
        ) : null}
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-3 md:gap-3 md:px-5">
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className={`truncate text-sm font-black md:text-lg ${homeWon ? "text-[#e8ebf2]" : DIM}`}>
            {match.home}
          </span>
          <TeamLogo team={match.home} />
        </span>
        <span className="flex items-baseline gap-1.5 text-lg font-black tabular-nums md:text-2xl">
          <span className={homeWon ? "text-[#2BE39B]" : DIM}>{match.homeSets}</span>
          <span className="text-[0.75rem] text-[#7a8299]">:</span>
          <span className={homeWon ? DIM : "text-[#2BE39B]"}>{match.awaySets}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <TeamLogo team={match.away} />
          <span className={`truncate text-sm font-black md:text-lg ${homeWon ? DIM : "text-[#e8ebf2]"}`}>
            {match.away}
          </span>
        </span>
      </div>

      {/* 9전제 × 12경기를 다 펼치면 화면이 터진다 — 접어둔다 */}
      {match.sets?.length ? (
        <details className="group border-t border-[rgba(155,185,240,0.07)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-[0.6875rem] font-bold text-[#7a8299] transition hover:text-[#d4a94a] md:px-5 md:text-xs [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-[0.625rem] transition-transform group-open:rotate-90">
              ▶
            </span>
            세트 {match.sets.length}
          </summary>
          <ul className="px-3 pb-2 md:px-4 md:pb-3">
            {match.sets.map((set, index) => (
              <SetRow key={index} set={set} index={index} players={players} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/**
 * 정렬(최신순)과 거르기는 호출부(page)가 끝내고 온다.
 * 파서가 버리는 건 "동점인 경기"지 "안 끝난 경기"가 아니다 — 경기 도중 3:2에 저장하면
 * 여기 끝난 것처럼 뜬다. 경기가 끝난 뒤에 넣는 것이 전제다.
 */
export default function JungmanMatchResults({
  matches,
  players,
}: {
  matches: JungmanStandingsMatch[];
  players: RaceLookupPlayer[];
}) {
  return (
    <div className="mt-3 md:mt-4">
      <h2 className="mb-2 px-1 text-base font-black tracking-tight md:mb-3 md:text-xl">경기 결과</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {matches.map((match, index) => (
          <MatchCard key={`${match.group}-${match.home}-${match.away}-${index}`} match={match} players={players} />
        ))}
      </div>
    </div>
  );
}
