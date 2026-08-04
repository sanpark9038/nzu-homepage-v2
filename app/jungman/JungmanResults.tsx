import {
  formatVotes,
  JUNGMAN_FINAL_TOTAL,
  JUNGMAN_SEED_CUT,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTE_PERIOD_LABEL,
  teamAccent,
  type JungmanStanding,
} from "@/lib/jungman";

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

// 1·2·3위 구분은 보더와 순위 숫자 색으로만 한다 — 결과 화면에 장식을 더 얹을 이유가 없다.
// 네 번째 칸은 수술대(4시드) — 투표 밖에서 확보한 자리라 스틸 블루로 구분한다.
const PODIUM = [
  { border: "border-[rgba(212,169,74,0.5)]", bg: "bg-[rgba(212,169,74,0.06)]", text: "text-[#d4a94a]" },
  { border: "border-[rgba(192,200,216,0.4)]", bg: "bg-[rgba(192,200,216,0.05)]", text: "text-[#c0c8d8]" },
  { border: "border-[rgba(201,136,90,0.4)]", bg: "bg-[rgba(201,136,90,0.05)]", text: "text-[#c9885a]" },
  { border: "border-[rgba(159,182,224,0.4)]", bg: "bg-[rgba(159,182,224,0.05)]", text: "text-[#9fb6e0]" },
];

/** 로고 파일이 없는 팀은 팀 색 원 + 코드로 대신한다 (fs 확인은 서버에서 이미 끝났다) */
function TeamLogo({ src, team, size }: { src: string | null; team: JungmanStanding["team"]; size: number }) {
  if (src) {
    // width/height를 박아 CLS를 막는다. next/image를 쓸 만큼 큰 이미지가 아니다.
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-contain"
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-[#0b0f1a]"
      style={{ width: size, height: size, fontSize: size * 0.34, backgroundColor: teamAccent(team) }}
    >
      {team.code}
    </span>
  );
}

export default function JungmanResults({
  standings,
  logos,
}: {
  standings: JungmanStanding[];
  logos: Record<string, string | null>;
}) {
  const podium = standings.slice(0, JUNGMAN_SEED_CUT);
  const rest = standings.slice(JUNGMAN_SEED_CUT);
  const leaderVotes = standings[0]?.votes || 0;
  const seedTeam = JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE);

  return (
    <div className="flex flex-col gap-3">
      <section className={`${PANEL} px-4 py-4 md:p-6`}>
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a] md:text-[0.6875rem]">
          K-중만컵 · 인기투표
        </p>
        <h1 className="mt-2 text-xl font-black tracking-tight md:text-3xl">최종 결과</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
            <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">투표 기간</dt>
            <dd className="mt-2 font-bold text-[#e8ebf2]">{JUNGMAN_VOTE_PERIOD_LABEL}</dd>
          </div>
          <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
            <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">총 투표수</dt>
            <dd className="mt-2 font-bold tabular-nums text-[#e8ebf2]">{formatVotes(JUNGMAN_FINAL_TOTAL)}표</dd>
          </div>
        </dl>
      </section>

      {/* 시드 4자리를 한 줄에 — 1~3위는 득표로, 수술대는 투표 밖에서 가져간 자리다 */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {podium.map((standing, index) => {
          const tone = PODIUM[index];
          return (
            <section
              key={standing.team.code}
              className={`flex items-center gap-3 rounded-[1.4rem] border ${tone.border} ${tone.bg} px-4 py-4 md:flex-col md:items-start md:gap-2 md:px-5`}
            >
              <span className={`text-3xl font-black tabular-nums leading-none md:text-4xl ${tone.text}`}>
                {standing.rank}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <TeamLogo src={logos[standing.team.code] ?? null} team={standing.team} size={28} />
                  <span className="truncate text-base font-black md:text-lg">{standing.team.name}</span>
                </div>
                <p className="font-mono text-2xl font-black tabular-nums md:text-3xl">
                  {formatVotes(standing.votes || 0)}
                  <span className="ml-1 text-sm font-bold text-[#7a8299]">표</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[0.6875rem] font-black ${tone.text}`}>
                    {standing.rank}번 시드권
                  </span>
                  {index === 0 ? (
                    <span className="rounded bg-[#d4a94a]/15 px-1.5 py-0.5 text-[0.6875rem] font-black text-[#d4a94a]">
                      히든룰
                    </span>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}

        {seedTeam ? (
          <section
            className={`flex items-center gap-3 rounded-[1.4rem] border ${PODIUM[3].border} ${PODIUM[3].bg} px-4 py-4 md:flex-col md:items-start md:gap-2 md:px-5`}
          >
            <span className={`text-3xl font-black tabular-nums leading-none md:text-4xl ${PODIUM[3].text}`}>4</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <TeamLogo src={logos[seedTeam.code] ?? null} team={seedTeam} size={28} />
                <span className="truncate text-base font-black md:text-lg">{seedTeam.name}</span>
              </div>
              {/* 득표수 자리 — 투표 없이 확보한 자리임을 같은 위계로 말한다 */}
              <p className="text-2xl font-black leading-tight md:text-3xl">
                자동 확보
                <span className="ml-1 text-sm font-bold text-[#7a8299]">투표 제외</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[0.6875rem] font-black ${PODIUM[3].text}`}>
                  4번 시드권
                </span>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <section className={`${PANEL} px-3 py-3 md:px-4 md:py-4`}>
        <ul className="flex flex-col">
          {rest.map((standing) => {
            const votes = standing.votes || 0;
            return (
              <li
                key={standing.team.code}
                className="flex items-center gap-3 border-t border-[rgba(155,185,240,0.1)] px-1 py-2.5 first:border-t-0"
              >
                <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-[#7a8299]">
                  {standing.rank}
                </span>
                <TeamLogo src={logos[standing.team.code] ?? null} team={standing.team} size={22} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-bold">{standing.team.name}</span>
                  {/* 1위 대비 비율 — 숫자만으로는 격차가 안 읽힌다 */}
                  <span className="block h-1 w-full overflow-hidden rounded-full bg-[rgba(155,185,240,0.1)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${leaderVotes > 0 ? (votes / leaderVotes) * 100 : 0}%`,
                        backgroundColor: teamAccent(standing.team),
                      }}
                    />
                  </span>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{formatVotes(votes)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="px-1 text-[0.6875rem] text-[#7a8299]">정중만님 공지 발표 기준 공식 집계입니다.</p>
    </div>
  );
}
