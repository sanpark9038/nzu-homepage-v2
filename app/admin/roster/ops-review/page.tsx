import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import RosterReviewDecisionButtons from "@/components/admin/roster/RosterReviewDecisionButtons";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { buildRosterOpsReview, type RosterOpsReviewPlayer } from "@/lib/admin-roster-ops-review";
import LogoutButton from "../../ops/LogoutButton";

export const dynamic = "force-dynamic";

type ReviewItem = Record<string, unknown>;
type ReviewKind = "affiliation_change" | "tier_change" | "new_candidate" | "excluded_candidate";

const REVIEW_SECTIONS: Array<{
  kind: ReviewKind;
  title: string;
  empty: string;
  actionLabel: string;
}> = [
  {
    kind: "affiliation_change",
    title: "소속변동감지",
    empty: "소속변동감지 항목 없음",
    actionLabel: "반영",
  },
  {
    kind: "tier_change",
    title: "티어변동감지",
    empty: "티어변동감지 항목 없음",
    actionLabel: "반영",
  },
  {
    kind: "new_candidate",
    title: "신규후보",
    empty: "신규후보 항목 없음",
    actionLabel: "등록",
  },
  {
    kind: "excluded_candidate",
    title: "제외후보",
    empty: "제외후보가 없습니다.",
    actionLabel: "제외 확인",
  },
];

function playerRowKey(item: RosterOpsReviewPlayer, index: number): string {
  return [item.entity_id, item.wr_id, item.name, index].filter(Boolean).join(":");
}

function text(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "-";
}

function itemKey(item: ReviewItem, index: number): string {
  return [item.entity_id, item.name, item.review_kind, index].map(text).join(":");
}

function filterByKind(items: ReviewItem[], kind: ReviewKind): ReviewItem[] {
  return items.filter((item) => text(item.review_kind) === kind);
}

function PlayerList({ items }: { items: RosterOpsReviewPlayer[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">항목이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="p-2 text-left">선수</th>
            <th className="p-2 text-left">팀</th>
            <th className="p-2 text-left">티어</th>
            <th className="p-2 text-left">사유</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 60).map((item, index) => (
            <tr key={playerRowKey(item, index)} className="border-t border-border/60">
              <td className="p-2">
                <p className="font-semibold text-foreground">{item.display_name || item.name || "-"}</p>
                <p className="text-xs text-muted-foreground">{item.entity_id || item.wr_id || "-"}</p>
              </td>
              <td className="p-2 text-muted-foreground">
                {item.team_name || "-"} {item.team_code ? `(${item.team_code})` : ""}
              </td>
              <td className="p-2 text-muted-foreground">{item.tier || "-"}</td>
              <td className="p-2 text-muted-foreground">{item.reason || item.source || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalRows({
  title,
  empty,
  actionLabel,
  items,
}: {
  title: string;
  empty: string;
  actionLabel: string;
  items: ReviewItem[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-base font-black">
          {title} {items.length}건
        </h2>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">선수</th>
                <th className="p-2 text-left">현재 기준데이터</th>
                <th className="p-2 text-left">새로 감지된 값</th>
                <th className="p-2 text-left">상태</th>
                <th className="p-2 text-left">처리</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const href = text(item.decision_url) !== "-" ? text(item.decision_url) : "/admin/roster";
                return (
                  <tr key={itemKey(item, index)} className="border-t border-border/60">
                    <td className="p-2">
                      <p className="font-bold text-foreground">{text(item.name)}</p>
                      <p className="text-xs text-muted-foreground">{text(item.entity_id)}</p>
                    </td>
                    <td className="p-2 text-muted-foreground">{text(item.from)}</td>
                    <td className="p-2 font-semibold text-foreground">{text(item.to)}</td>
                    <td className="p-2">
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                        기준데이터 미반영
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">전적 수집은 계속 진행</p>
                      <p className="mt-1 text-xs text-muted-foreground">다음 데이터파이프라인 때 반영됩니다</p>
                    </td>
                    <td className="p-2">
                      <RosterReviewDecisionButtons
                        actionHref={href}
                        actionLabel={actionLabel}
                        entityId={text(item.entity_id)}
                        name={text(item.name)}
                        reviewKind={text(item.review_kind)}
                        observedFrom={text(item.from)}
                        observedTo={text(item.to)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RosterOpsReviewPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/roster/ops-review");
  }

  const review = await buildRosterOpsReview();
  const groups = review.groups;
  const rosterItems = groups.roster_change_review.items as ReviewItem[];
  const newCandidates = groups.new_player_candidates.items as ReviewItem[];
  const affiliationItems = filterByKind(rosterItems, "affiliation_change");
  const tierItems = filterByKind(rosterItems, "tier_change");
  const newCandidateItems = filterByKind(newCandidates, "new_candidate");
  const excludedCandidateItems = filterByKind(rosterItems, "excluded_candidate");
  const decisionTotal = affiliationItems.length + tierItems.length + newCandidateItems.length + excludedCandidateItems.length;

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminNav />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground">승인 대기함</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">대표님 검토 필요: {decisionTotal}건</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/roster"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground"
            >
              로스터 교정 열기
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm md:grid-cols-6">
          <div>
            <p className="text-2xl font-black">{affiliationItems.length}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">소속변동감지</p>
          </div>
          <div>
            <p className="text-2xl font-black">{tierItems.length}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">티어변동감지</p>
          </div>
          <div>
            <p className="text-2xl font-black">{newCandidateItems.length}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">신규후보</p>
          </div>
          <div>
            <p className="text-2xl font-black">{excludedCandidateItems.length}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">제외후보</p>
          </div>
          <div>
            <p className="text-sm font-black text-foreground">전적 수집: 정상 진행 중</p>
            <p className="mt-1 text-xs text-muted-foreground">기존 선수 전적은 검토 상태와 별도로 수집됩니다.</p>
          </div>
          <div>
            <p className="text-sm font-black text-foreground">기준데이터 반영: 대기 중</p>
            <p className="mt-1 text-xs text-muted-foreground">대표님 확인 전에는 자동 반영하지 않습니다.</p>
          </div>
        </section>

        <section className="space-y-6 rounded-lg border border-border bg-card p-4">
          {REVIEW_SECTIONS.map((section) => (
            <ApprovalRows
              key={section.kind}
              title={section.title}
              empty={section.empty}
              actionLabel={section.actionLabel}
              items={section.kind === "new_candidate" ? newCandidateItems : filterByKind(rosterItems, section.kind)}
            />
          ))}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-black">추가 점검</h2>
            <p className="mt-1 text-sm text-muted-foreground">승인 판단과 별개로 데이터 품질이나 수집 상태를 확인하는 참고 목록입니다.</p>
          </div>

          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer list-none font-bold">SOOP ID 누락 {groups.missing_soop_ids.count}건</summary>
            <div className="mt-3">
              <PlayerList items={groups.missing_soop_ids.items} />
            </div>
          </details>

          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer list-none font-bold">전적 0건 선수 {groups.zero_record_players.count}건</summary>
            <div className="mt-3">
              <PlayerList items={groups.zero_record_players.items} />
            </div>
          </details>

          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer list-none font-bold">수집 제외 선수 {groups.excluded_players.count}건</summary>
            <div className="mt-3">
              <PlayerList items={groups.excluded_players.items} />
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
