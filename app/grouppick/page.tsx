// 접수 마감(2026-08-04). 폼과 접수 API는 삭제했고, 링크 타고 오는 사람에게 보여줄 안내만 남긴다.
import { GROUPS, ANSWER, teamName } from "./teams";

export default function GroupPickClosedPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold">중만컵 조편성 예측</h1>
        <p className="mt-2 text-sm text-slate-500">
          접수가 마감되었습니다. 추첨이 끝나 아래와 같이 조편성이 확정되었어요.
        </p>

        <div className="mt-6 space-y-3">
          {GROUPS.map((group) => (
            <div key={group} className="rounded-2xl bg-slate-900 p-4 text-white">
              <div className="text-xs font-bold tracking-[0.2em] text-white/45">GROUP {group}</div>
              <div className="mt-1 text-sm font-bold">
                {ANSWER[group].map(teamName).join(" · ")}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 pb-10 text-xs text-slate-400">당첨자는 방송에서 발표합니다.</p>
      </div>
    </main>
  );
}
