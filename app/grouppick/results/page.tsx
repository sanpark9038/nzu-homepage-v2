import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { getOverlayAccessStatus } from "@/lib/overlay-access";
import { AccessGate } from "@/app/overlay/admin/AccessGate";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { TEAMS, GROUPS, ANSWER, setKey, teamName, type GroupKey } from "../teams";

export const dynamic = "force-dynamic";

type Submission = { name: string; groups: Record<string, string[]>; at?: string };

const ANSWER_KEY = Object.fromEntries(GROUPS.map((g) => [g, setKey(ANSWER[g])])) as Record<
  GroupKey,
  string
>;
const ANSWER_GROUP_OF = new Map(GROUPS.flatMap((g) => ANSWER[g].map((code) => [code, g])));

export default async function GroupPickResultsPage() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-black text-white/90">조편성 예측 결과</h1>
        <p className="max-w-md text-sm leading-relaxed text-white/55">
          주최자 전용 페이지입니다. 숲티비로 로그인해 주세요.
        </p>
        <a
          href="/api/auth/soop/start?next=/grouppick/results"
          className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:opacity-80"
        >
          숲티비로 로그인
        </a>
      </div>
    );
  }

  const access = await getOverlayAccessStatus(session.providerUserId);
  if (access === "none" || access === "pending") {
    return <AccessGate initialStatus={access} displayName={session.displayName} />;
  }

  const db = createSupabaseAdminClient();
  const { data: rows } = await db
    .from("overlay_state")
    .select("overlay_key, data, updated_at")
    .like("overlay_key", "grouppick:%")
    .order("updated_at", { ascending: false });

  const all = rows ?? [];

  // 같은 닉네임은 최신 1건만 유효 (updated_at desc 순회 → 먼저 만난 것이 최신)
  const latest = new Map<string, { sub: Submission; at: string }>();
  for (const row of all) {
    const sub = row.data as unknown as Submission;
    if (!sub?.name || !sub?.groups) continue;
    const key = sub.name.trim().toLowerCase();
    if (!latest.has(key)) latest.set(key, { sub, at: row.updated_at });
  }

  const scored = [...latest.values()]
    .map(({ sub, at }) => ({
      name: sub.name,
      at: sub.at ?? at,
      groups: sub.groups,
      hit: Object.fromEntries(
        GROUPS.map((g) => [g, setKey(sub.groups[g] ?? []) === ANSWER_KEY[g]])
      ) as Record<GroupKey, boolean>,
    }))
    .map((entry) => ({ ...entry, matched: GROUPS.filter((g) => entry.hit[g]).length }))
    .sort((a, b) => b.matched - a.matched || a.name.localeCompare(b.name, "ko"));

  const winners = scored.filter((s) => s.matched === 4);
  const total = scored.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const matrix = new Map<string, Record<GroupKey, number>>();
  for (const team of TEAMS) matrix.set(team.code, { A: 0, B: 0, C: 0, D: 0 });
  for (const entry of scored) {
    for (const group of GROUPS) {
      for (const code of entry.groups[group] ?? []) {
        const row = matrix.get(code);
        if (row) row[group] += 1;
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <header>
          <h1 className="text-2xl font-bold">중만컵 조편성 예측 결과</h1>
          <p className="mt-1 text-sm text-slate-500">
            유효 제출 {total}명 (고유 숲 아이디) / 전체 {all.length}건
          </p>
        </header>

        <section>
          <h2 className="text-lg font-bold">실제 조편성</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group} className="rounded-xl bg-slate-900 p-4 text-white">
                <div className="text-xs font-bold tracking-[0.2em] text-white/45">
                  GROUP {group}
                </div>
                <ul className="mt-2 space-y-1 text-sm font-bold">
                  {ANSWER[group].map((code) => (
                    <li key={code}>{teamName(code)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">
            당첨자 <span className="text-blue-700">{winners.length}명</span>
            <span className="ml-1 text-sm font-normal text-slate-400">4개 조 모두 적중</span>
          </h2>
          {winners.length === 0 ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              4개 조를 모두 맞힌 사람이 없습니다.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {winners.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-blue-600 bg-blue-50 px-4 py-3"
                >
                  <span className="font-bold text-blue-900">{entry.name}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(entry.at).toLocaleString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold">적중 조 수 분포</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[4, 3, 2, 1, 0].map((n) => {
              const count = scored.filter((s) => s.matched === n).length;
              return (
                <li key={n} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <div className="text-xs text-slate-500">{n}개 조 적중</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums">
                    {count}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      명 · {pct(count)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">신청자별 예측 대조표</h2>
          <p className="mt-1 text-sm text-slate-500">
            초록 칸은 조 전체 적중, 진한 글씨는 그 조에 실제로 들어간 팀. 적중 수 내림차순.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-2">이름</th>
                  {GROUPS.map((g) => (
                    <th key={g} className="px-2 py-2">
                      {g}조
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">적중</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-slate-900 bg-slate-900 text-white">
                  <td className="px-3 py-2 font-bold">실제 결과</td>
                  {GROUPS.map((g) => (
                    <td key={g} className="px-2 py-2 font-bold leading-relaxed">
                      {ANSWER[g].map((code) => (
                        <div key={code}>{teamName(code)}</div>
                      ))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold">4/4</td>
                </tr>
                {scored.map((entry) => (
                  <tr key={entry.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 align-top font-semibold">{entry.name}</td>
                    {GROUPS.map((group) => (
                      <td
                        key={group}
                        className={`px-2 py-2 align-top leading-relaxed ${
                          entry.hit[group] ? "bg-emerald-50" : ""
                        }`}
                      >
                        {(entry.groups[group] ?? []).map((code) => (
                          <div
                            key={code}
                            className={
                              ANSWER_GROUP_OF.get(code) === group
                                ? "font-bold text-emerald-800"
                                : "text-slate-400"
                            }
                          >
                            {teamName(code)}
                          </div>
                        ))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right align-top">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-bold tabular-nums ${
                          entry.matched === 4
                            ? "bg-blue-600 text-white"
                            : entry.matched > 0
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {entry.matched}/4
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">팀별 조 예측 비율</h2>
          <p className="mt-1 text-sm text-slate-500">파란 칸이 실제 배정된 조.</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-3 py-2">팀</th>
                  {GROUPS.map((g) => (
                    <th key={g} className="px-3 py-2 text-right">
                      {g}조
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEAMS.map((team) => {
                  const row = matrix.get(team.code)!;
                  return (
                    <tr key={team.code} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-semibold">{team.name}</td>
                      {GROUPS.map((g) => (
                        <td
                          key={g}
                          className={`px-3 py-2 text-right tabular-nums ${
                            ANSWER_GROUP_OF.get(team.code) === g
                              ? "bg-blue-50 font-bold text-blue-800"
                              : "text-slate-500"
                          }`}
                        >
                          {pct(row[g])}%
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
