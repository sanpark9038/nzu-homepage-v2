import Image from "next/image";
import Link from "next/link";

// 대회 정보와 D-day 계산은 lib/jungman.ts 한 곳에 산다 — 홈 커버 덱이 같은 값을 그린다
import {
  JUNGMAN_FINAL_NOTE,
  JUNGMAN_BRACKET_NOTE,
  JUNGMAN_FINAL_PLACE,
  JUNGMAN_FORMAT_LINE,
  JUNGMAN_GROUP_COLORS,
  JUNGMAN_MATCH_TIME,
  JUNGMAN_PRIZE_DETAIL,
  JUNGMAN_PRIZE_TOTAL,
  jungmanDaysToFinal as daysToFinal,
  jungmanLogoPath,
  jungmanTeamByName,
} from "@/lib/jungman";
import type { JungmanStandingsMatch } from "@/lib/jungman-standings";

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

/** 조 색은 이름 첫 글자로 잡는다 — 모르는 조 이름에 조 색을 붙이면 거짓말이 된다 */
function groupColor(group: string): string {
  const index = "ABCD".indexOf(group.trim().charAt(0).toUpperCase());
  return index < 0 ? "#7a8299" : JUNGMAN_GROUP_COLORS[index];
}

/** 날짜가 지났는데 결과가 안 들어온 경기는 D-day를 그리지 않는다 */
function ddayLabel(date: string, todayKST: string): string | null {
  const dday = Math.round((Date.parse(date) - Date.parse(todayKST)) / 86_400_000);
  if (dday < 0) return null;
  return dday === 0 ? "오늘" : dday === 1 ? "내일" : `D-${dday}`;
}

/** 못 찾는 팀 이름(오타·외부팀)은 로고 없이 이름만 */
function TeamSide({ name, logoFirst }: { name: string; logoFirst: boolean }) {
  const code = jungmanTeamByName(name)?.code;
  const logo = code ? (
    <Image
      src={jungmanLogoPath(code)}
      alt=""
      width={56}
      height={56}
      className="h-9 w-9 shrink-0 object-contain md:h-12 md:w-12"
    />
  ) : null;
  const label = <span className="truncate text-base font-black text-[#e8ebf2] md:text-2xl">{name}</span>;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoFirst ? (
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
 * /jungman 커버. 대회 정보 아래에 다음 경기를 가로로 넓게 편다 —
 * 좁은 칸에 몰아넣으면 이 페이지에서 가장 자주 바뀌는 정보가 가장 작게 나온다.
 * 높이를 일부러 낮게 잡는다 — 이 페이지의 주인공은 바로 아래 조별 순위표다.
 */
export default function JungmanCover({ upcoming = [] }: { upcoming?: JungmanStandingsMatch[] }) {
  const dday = daysToFinal();
  const todayKST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 대회가 끝나면 오른쪽 칸이 통째로 없어지고 왼쪽이 전체 폭을 쓴다
  const [next, ...rest] = upcoming;
  const nextColor = next ? groupColor(next.group) : "#7a8299";
  const nextDday = next?.date ? ddayLabel(next.date, todayKST) : null;

  return (
    <section className="mb-3 rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)] md:mb-4">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight md:text-4xl">K-중만컵</h1>
            {/* 결승이 지나면 뱃지는 의미가 없다 — 그냥 안 그린다 */}
            {dday >= 0 ? (
              <span className="rounded bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black tabular-nums text-[#d4a94a]">
                {dday > 0 ? `D-${dday}` : "D-DAY"}
              </span>
            ) : null}
            {/* 이 대회를 어디서 보는지 — 커버 밖으로 밀어내면 찾을 곳이 없다. 폰에서는 제목 아래로 내려간다 */}
            <a
              href="https://www.sooplive.com/station/ititit"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#7a8299] px-3 text-[0.6875rem] font-bold text-[#e8ebf2] transition-colors hover:border-[#d4a94a] hover:text-[#d4a94a] md:text-xs"
            >
              <span aria-hidden>▶</span>
              공식 방송국
              <span aria-hidden>↗</span>
            </a>
          </div>

          <p className="mt-1.5 text-xs font-bold text-[#d4a94a] md:mt-2 md:text-sm">{JUNGMAN_FORMAT_LINE}</p>
          {/* 홈 커버는 자리가 없어 이 줄을 뺐다 — 대회 규칙이 사이트에서 사라지지 않게 여기서 받는다 */}
          <p className="mt-1 text-[0.6875rem] text-[#7a8299] md:text-xs">{JUNGMAN_BRACKET_NOTE}</p>
        </div>

        {/* 다가오는 경기 — 왼쪽 큰 카드(코앞 경기)와 오른쪽 좁은 칸(그 뒤 둘)이 한 줄에 선다 */}
        {next ? (
          <div className="grid min-w-0 gap-2 md:grid-cols-5 md:gap-3">
            <div
              className={`min-w-0 rounded-[1rem] border bg-[rgba(11,15,26,0.55)] px-3 py-3 md:px-5 md:py-4 ${
                rest.length ? "md:col-span-3" : "md:col-span-5"
              }`}
              style={{ borderColor: nextColor }}
            >
              {/* 제목·D-day·일시·조가 한 줄이다 — 뱃지가 따로 놀면 그만큼 세로를 먹는다 */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-bold md:text-xs">
                <span className="uppercase tracking-[0.22em] text-[#7a8299]">다음 경기</span>
                {nextDday ? (
                  <span
                    className="rounded px-1.5 py-0.5 font-black"
                    style={{ color: nextColor, background: `${nextColor}1f` }}
                  >
                    {nextDday}
                  </span>
                ) : null}
                <span className="tabular-nums text-[#7a8299]">
                  {next.date ? `${formatMatchDate(next.date)} ${JUNGMAN_MATCH_TIME} · ` : null}
                  <span className="font-black" style={{ color: nextColor }}>
                    {next.group}
                  </span>
                </span>
              </p>
              {/* 좌우는 홈·원정 자리로 고정한다 — 순서가 흔들리면 소속이 안 보인다 */}
              <div className="mt-2 flex flex-col gap-2 md:mt-2.5 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-2 md:gap-4">
                  <TeamSide name={next.home} logoFirst />
                  <span className="shrink-0 text-[0.625rem] font-black text-[#7a8299] md:text-xs">vs</span>
                  <TeamSide name={next.away} logoFirst={false} />
                </div>
                {/* 폰에서는 팀명 아래 줄로 내려간다 — 같은 줄에 두면 팀 이름이 밀린다 */}
                <Link
                  href="/prediction"
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 self-start rounded-full bg-nzu-green px-3 text-[0.6875rem] font-black text-black md:ml-auto md:text-xs"
                >
                  승부예측 <span aria-hidden>→</span>
                </Link>
              </div>
            </div>

            {/* 그 뒤 둘은 붙여서 한 묶음으로 읽힌다 — 폰에서는 큰 카드 아래로 내려간다 */}
            {rest.length ? (
              <ul className="flex min-w-0 flex-col justify-center divide-y divide-[rgba(155,185,240,0.14)] rounded-[1rem] border border-[rgba(155,185,240,0.14)] bg-[rgba(11,15,26,0.55)] px-3 md:col-span-2">
                {rest.slice(0, 2).map((match, index) => (
                  <li
                    key={`${match.date ?? ""}-${match.home}-${match.away}-${index}`}
                    className="flex min-w-0 items-center gap-2 py-1.5 text-[0.6875rem] text-[#7a8299] md:py-2 md:text-xs"
                  >
                    {/* 날짜+시간은 절대 안 잘린다 — 잘릴 몫은 아래 팀 이름이 진다 */}
                    <span
                      className="shrink-0 whitespace-nowrap tabular-nums"
                      style={{ color: groupColor(match.group) }}
                    >
                      {match.date ? `${formatMatchDate(match.date)} ${JUNGMAN_MATCH_TIME} ·` : match.group}
                    </span>
                    <span className="truncate font-bold text-[#e8ebf2]">
                      {match.home} vs {match.away}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <dl className="grid gap-2 text-sm md:grid-cols-2 md:gap-4">
          <div>
            <dt className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]">총상금</dt>
            <dd className="mt-0.5 font-bold text-[#e8ebf2]">
              {JUNGMAN_PRIZE_TOTAL}
              <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
                {JUNGMAN_PRIZE_DETAIL}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]">
              그랜드 파이널
            </dt>
            <dd className="mt-0.5 font-bold text-[#e8ebf2]">
              {JUNGMAN_FINAL_PLACE}
              <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
                {JUNGMAN_FINAL_NOTE}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
