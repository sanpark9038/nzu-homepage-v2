import Image from "next/image";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { jungmanLogoPath, jungmanTeamByName } from "@/lib/jungman";
import { type JungmanPlayerRank } from "@/lib/jungman-standings";
import { raceOfName, type RaceLookupPlayer } from "@/lib/overlay-race";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

/** 순위 · 로고 · 이름+종족 · 전적 · 승률. 로고를 못 찾아도 칸은 남아 이름 줄이 안 어긋난다 */
const ROW =
  "grid grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_auto_2.5rem] items-center gap-1.5 border-t border-[rgba(155,185,240,0.07)] py-1.5 first:border-t-0 md:gap-2 md:py-2";

function Row({
  rank,
  index,
  players,
}: {
  rank: JungmanPlayerRank;
  index: number;
  players: RaceLookupPlayer[];
}) {
  // 못 찾는 팀 이름(오타·외부팀)은 로고 없이 — 공개 화면에 경고는 그리지 않는다
  const code = jungmanTeamByName(rank.team)?.code;
  // 선수 DB가 비었거나 이름을 못 찾으면 배지 없이 이름만
  const race = raceOfName(players, rank.name);

  return (
    <li className={ROW}>
      <span
        className={`text-center text-[0.625rem] font-black tabular-nums md:text-xs ${
          index < 3 ? "text-[#d4a94a]" : "text-[#7a8299]"
        }`}
      >
        {index + 1}
      </span>
      {code ? (
        <Image
          src={jungmanLogoPath(code)}
          alt={rank.team}
          width={24}
          height={24}
          className="h-5 w-5 object-contain md:h-6 md:w-6"
        />
      ) : (
        <span />
      )}
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs font-bold text-[#e8ebf2] md:text-sm">{rank.name}</span>
        {race ? <RaceLetterBadge race={race} size="sm" /> : null}
      </span>
      <span className="text-[0.625rem] font-bold tabular-nums text-[#7a8299] md:text-xs">
        {rank.wins}승 {rank.losses}패
      </span>
      <span className="text-right text-[0.625rem] font-black tabular-nums text-[#e8ebf2] md:text-xs">
        {Math.round((rank.wins / (rank.wins + rank.losses)) * 100)}%
      </span>
    </li>
  );
}

/**
 * 개인 순위 TOP 10. 계산(다승 → 승률 → 이름)은 buildJungmanPlayerRanks가 끝내고 온다.
 * 홈 덱과 달리 종족 배지를 붙인다 — 선수 DB를 읽을 수 있는 화면이다.
 */
export default function JungmanPlayerRanks({
  ranks,
  players,
}: {
  ranks: JungmanPlayerRank[];
  players: RaceLookupPlayer[];
}) {
  if (!ranks.length) return null;

  return (
    <div>
      <h2 className="mb-2 flex flex-wrap items-baseline gap-2 px-1 text-base font-black tracking-tight md:mb-3 md:text-xl">
        개인 순위
        <span className="text-[0.6875rem] font-normal text-[#7a8299] md:text-xs">
          TOP 10 · 다승 → 승률 순
        </span>
      </h2>
      <ol className={`${PANEL} px-3 py-1 md:px-4 md:py-1.5`}>
        {ranks.slice(0, 10).map((rank, index) => (
          <Row key={rank.name} rank={rank} index={index} players={players} />
        ))}
      </ol>
    </div>
  );
}
