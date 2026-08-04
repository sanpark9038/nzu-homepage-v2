import type { Metadata } from "next";

import JungmanSubNav from "@/components/jungman/JungmanSubNav";
import {
  buildJungmanGroupTables,
  JUNGMAN_STANDINGS_KEY,
  parseJungmanStandings,
  type JungmanGroupTable,
} from "@/lib/jungman-standings";
import { getSetting } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "K-중만컵 조별 순위",
  description:
    "K-중만컵 조별리그 순위표. 4개조 12팀의 승패 · 세트 득실 · 잔여 경기를 조별로 확인할 수 있습니다.",
  alternates: { canonical: "/jungman/standings" },
  openGraph: {
    title: "K-중만컵 조별 순위 | 호사가 HOSAGA",
    description: "K-중만컵 조별리그 순위 — 승패, 세트 득실, 잔여 경기",
    url: "/jungman/standings",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

const TH = "px-2 py-2 text-right font-bold text-[#7a8299] md:px-3";
const TD = "px-2 py-2 text-right tabular-nums md:px-3";

function GroupCard({ table }: { table: JungmanGroupTable }) {
  return (
    <section className={`${PANEL} px-3 py-3 md:px-5 md:py-4`}>
      <h2 className="text-sm font-black tracking-tight md:text-base">{table.name}조 팀 순위</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-xs md:text-sm">
          <thead>
            <tr className="border-b border-[rgba(155,185,240,0.14)] text-[0.6875rem] uppercase tracking-[0.08em] md:text-xs">
              <th className={`${TH} text-left`}>순위</th>
              <th className={`${TH} text-left`}>팀</th>
              <th className={TH}>승</th>
              <th className={TH}>패</th>
              <th className={TH}>세트승</th>
              <th className={TH}>세트득실</th>
              <th className={TH}>잔여</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={row.team} className="border-b border-[rgba(155,185,240,0.07)] last:border-0">
                <td className={`${TD} text-left font-bold text-[#d4a94a]`}>{index + 1}</td>
                <td className="px-2 py-2 text-left font-bold text-[#e8ebf2] md:px-3">{row.team}</td>
                <td className={TD}>{row.wins}</td>
                <td className={TD}>{row.losses}</td>
                <td className={TD}>{row.setsWon}</td>
                <td className={TD}>{row.setDiff > 0 ? `+${row.setDiff}` : row.setDiff}</td>
                <td className={`${TD} text-[#7a8299]`}>{row.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function JungmanStandingsPage() {
  // 읽기 실패는 getSetting이 던진다 — 빈 순위표를 정상 상태로 캐시하는 것보다 낫다
  const standings = parseJungmanStandings(await getSetting(JUNGMAN_STANDINGS_KEY));
  const tables = standings ? buildJungmanGroupTables(standings) : [];

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-3 md:px-5 md:py-5">
        <JungmanSubNav activeHref="/jungman/standings" />

        <section className={`${PANEL} mb-3 px-4 py-3 md:mb-4 md:px-5 md:py-4`}>
          <p className="hidden text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a] md:block">
            K-중만컵 · 조별리그
          </p>
          <h1 className="text-xl font-black tracking-tight md:mt-2 md:text-3xl">조별 순위</h1>
          <p className="mt-1.5 hidden text-sm text-[#7a8299] md:block">
            승 → 세트 득실 → 세트 승 순으로 정렬합니다. 잔여는 조별 풀리그에서 남은 경기 수입니다.
          </p>
        </section>

        {tables.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tables.map((table) => (
              <GroupCard key={table.name} table={table} />
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
        )}
      </main>
    </div>
  );
}
