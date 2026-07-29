import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { getOverlayAccessStatus } from "@/lib/overlay-access";
import { AccessGate } from "@/app/overlay/admin/AccessGate";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { FREE_TEAMS, GROUPS, teamName, type GroupKey } from "../teams";

export const dynamic = "force-dynamic";

type Submission = { name: string; groups: Record<string, string[]>; at?: string };

/** 조합 동일성 판정 키 — 조별 자유 2팀을 정렬해 직렬화 (시드는 어차피 고정이라 뺀다) */
function comboKey(groups: Record<string, string[]>) {
  return GROUPS.map((g) => `${g}:${(groups[g] ?? []).slice(1).slice().sort().join(",")}`).join("|");
}

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
  const valid = [...latest.values()];

  const combos = new Map<string, { count: number; groups: Record<string, string[]> }>();
  const matrix = new Map<string, Record<GroupKey, number>>();
  for (const team of FREE_TEAMS) matrix.set(team.code, { A: 0, B: 0, C: 0, D: 0 });

  for (const { sub } of valid) {
    const key = comboKey(sub.groups);
    const entry = combos.get(key);
    if (entry) entry.count += 1;
    else combos.set(key, { count: 1, groups: sub.groups });

    for (const group of GROUPS) {
      for (const code of (sub.groups[group] ?? []).slice(1)) {
        const row = matrix.get(code);
        if (row) row[group] += 1;
      }
    }
  }

  const top = [...combos.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const pct = (n: number) => (valid.length ? Math.round((n / valid.length) * 100) : 0);
  const summarize = (groups: Record<string, string[]>) =>
    GROUPS.map((g) => `${g}: ${(groups[g] ?? []).map(teamName).join(", ")}`).join(" / ");

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">중만컵 조편성 예측 결과</h1>
          <p className="mt-1 text-sm text-slate-500">
            유효 제출 {valid.length}명 (고유 닉네임) / 전체 {all.length}건
          </p>
        </header>

        <section>
          <h2 className="text-lg font-bold">최다 예측 조합 Top 10</h2>
          {top.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">아직 제출이 없습니다.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {top.map((item, index) => (
                <li key={index} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="font-bold text-blue-700">
                    {index + 1}위 · {item.count}명 ({pct(item.count)}%)
                  </div>
                  <div className="mt-1 text-slate-700">{summarize(item.groups)}</div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold">팀별 조 배치 비율</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left">
                  <th className="py-2">팀</th>
                  {GROUPS.map((g) => (
                    <th key={g} className="py-2 text-right">
                      {g}조
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FREE_TEAMS.map((team) => {
                  const row = matrix.get(team.code)!;
                  return (
                    <tr key={team.code} className="border-b border-slate-100">
                      <td className="py-2 font-semibold">{team.name}</td>
                      {GROUPS.map((g) => (
                        <td key={g} className="py-2 text-right tabular-nums">
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

        <section>
          <h2 className="text-lg font-bold">신청자 목록</h2>
          <ul className="mt-3 space-y-2">
            {valid.map(({ sub, at }, index) => (
              <li key={index} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{sub.name}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(sub.at ?? at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="mt-1 text-slate-600">{summarize(sub.groups)}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
