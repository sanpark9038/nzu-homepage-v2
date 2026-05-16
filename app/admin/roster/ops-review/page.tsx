import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { buildRosterOpsReview, type RosterOpsReviewPlayer } from "@/lib/admin-roster-ops-review";
import LogoutButton from "../../ops/LogoutButton";

export const dynamic = "force-dynamic";

type ReviewGroupKey =
  | "new_player_candidates"
  | "missing_soop_ids"
  | "zero_record_players"
  | "roster_change_review"
  | "excluded_players";

type ReviewGroupMeta = {
  lane: "decision_queue" | "data_quality" | "reference";
  priority: "판단" | "점검" | "참고";
  title: string;
  description: string;
  nextAction: string;
  actionHref?: string;
};

const GROUP_META: Record<ReviewGroupKey, ReviewGroupMeta> = {
  new_player_candidates: {
    lane: "decision_queue",
    priority: "판단",
    title: "신규 선수 후보",
    description: "홈페이지 로스터에 아직 승인되지 않은 감지 후보입니다.",
    nextAction: "후보 승인/제외 흐름이 준비되면 로스터 편집에서 처리합니다.",
    actionHref: "/admin/roster",
  },
  roster_change_review: {
    lane: "decision_queue",
    priority: "판단",
    title: "로스터 변경 검토",
    description: "엘보드 소속, 티어, 종족, 이름 차이를 운영자가 판단해야 하는 항목입니다.",
    nextAction: "로스터 편집을 열고 운영자가 확인한 수정만 반영합니다.",
    actionHref: "/admin/roster",
  },
  missing_soop_ids: {
    lane: "data_quality",
    priority: "점검",
    title: "SOOP ID 누락",
    description: "승인된 로스터 선수 중 SOOP 채널 ID가 없는 항목입니다.",
    nextAction: "확인된 채널이 있을 때 로스터 편집에서 SOOP ID를 추가합니다.",
    actionHref: "/admin/roster",
  },
  zero_record_players: {
    lane: "data_quality",
    priority: "점검",
    title: "전적 0건 선수",
    description: "최신 로컬 파이프라인 알림에서 전적 0건으로 표시된 승인 선수입니다.",
    nextAction: "로스터 정보를 바꾸기 전에 수집 상태를 먼저 확인합니다.",
  },
  excluded_players: {
    lane: "reference",
    priority: "참고",
    title: "수집 제외 선수",
    description: "수집에서 의도적으로 제외된 선수이며 복구 참고용으로만 보여줍니다.",
    nextAction: "선수가 수집 대상에서 빠진 이유를 확인할 때만 참고합니다.",
  },
};

const REVIEW_QUEUE_SECTIONS: Array<{
  key: ReviewGroupMeta["lane"];
  title: string;
  description: string;
  groupKeys: ReviewGroupKey[];
}> = [
  {
    key: "decision_queue",
    title: "판단 대기",
    description: "다음 승인 동기화 전에 운영자 판단이 필요할 수 있는 항목입니다.",
    groupKeys: ["new_player_candidates", "roster_change_review"],
  },
  {
    key: "data_quality",
    title: "데이터 품질 점검",
    description: "승인된 로스터 중 출처, 수집, 채널 확인이 필요한 항목입니다.",
    groupKeys: ["missing_soop_ids", "zero_record_players"],
  },
  {
    key: "reference",
    title: "복구 참고",
    description: "제외 상태와 복구 판단을 위한 읽기 전용 참고 정보입니다.",
    groupKeys: ["excluded_players"],
  },
];

const SUMMARY_GROUP_KEYS: ReviewGroupKey[] = [
  "missing_soop_ids",
  "zero_record_players",
  "roster_change_review",
  "excluded_players",
  "new_player_candidates",
];

function playerRowKey(item: RosterOpsReviewPlayer, index: number): string {
  return [item.entity_id, item.wr_id, item.name, index].filter(Boolean).join(":");
}

function PlayerList({ items }: { items: RosterOpsReviewPlayer[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">항목이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="p-2 text-left">선수</th>
            <th className="p-2 text-left">팀</th>
            <th className="p-2 text-left">티어</th>
            <th className="p-2 text-left">사유</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 80).map((item, index) => (
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
      {items.length > 80 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">전체 {items.length}개 중 처음 80개를 표시합니다.</p>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "-";
}

function JsonList({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">항목이 없습니다.</p>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 40).map((item, index) => (
        <details key={index} className="rounded-md border border-border bg-background p-3">
          <summary className="cursor-pointer list-none">
            <span className="text-sm font-semibold text-foreground">
              {formatValue(item.name) !== "-" ? formatValue(item.name) : `검토 항목 ${index + 1}`}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {formatValue(item.team_code || item.team || item.reason || item.rule)}
            </span>
          </summary>
          <pre className="mt-3 max-h-40 overflow-auto text-xs text-muted-foreground">{JSON.stringify(item, null, 2)}</pre>
        </details>
      ))}
      {items.length > 40 ? <p className="text-xs text-muted-foreground">전체 {items.length}개 중 처음 40개를 표시합니다.</p> : null}
    </div>
  );
}

function ReviewSection({
  title,
  count,
  source,
  meta,
  children,
}: {
  title: string;
  count: number;
  source: string | null;
  meta: ReviewGroupMeta;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-border bg-card p-4" open={count > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span>
          <span className="block font-bold">{title}</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{meta.description}</span>
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground">{count}</span>
      </summary>
      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-border/70 bg-background px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{meta.priority}</p>
          <p className="mt-1 text-sm text-foreground">{meta.nextAction}</p>
          {meta.actionHref ? (
            <Link href={meta.actionHref} className="mt-2 inline-flex text-sm font-semibold text-nzu-green underline underline-offset-4">
              로스터 편집 열기
            </Link>
          ) : null}
        </div>
        {source ? <p className="text-xs text-muted-foreground">출처: {source}</p> : null}
        {children}
      </div>
    </details>
  );
}

function ReviewQueueSection({
  title,
  description,
  groupKeys,
  groups,
}: {
  title: string;
  description: string;
  groupKeys: ReviewGroupKey[];
  groups: Awaited<ReturnType<typeof buildRosterOpsReview>>["groups"];
}) {
  const total = groupKeys.reduce((sum, key) => sum + groups[key].count, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <p className="text-sm font-bold text-muted-foreground">총 {total}개</p>
      </div>
      <div className="space-y-3">
        {groupKeys.map((key) => (
          <ReviewSection key={key} title={GROUP_META[key].title} count={groups[key].count} source={groups[key].source} meta={GROUP_META[key]}>
            {key === "new_player_candidates" || key === "roster_change_review" ? (
              <JsonList items={groups[key].items} />
            ) : (
              <PlayerList items={groups[key].items} />
            )}
          </ReviewSection>
        ))}
      </div>
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

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminNav />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">로스터 운영 점검</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              로컬 메타데이터와 리포트에서 로스터 판단, 데이터 품질, 복구 참고 항목을 읽기 전용으로 확인합니다.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/roster"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground"
            >
              로스터 관리
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">생성 시각</p>
            <p className="mt-1 font-semibold">{review.generated_at}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">모드</p>
            <p className="mt-1 font-semibold">읽기 전용 점검</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">반영 기준</p>
            <p className="mt-1 font-semibold">운영자 확인 우선</p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-5">
          {SUMMARY_GROUP_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-black">{groups[key].count}</p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">{GROUP_META[key].title}</p>
            </div>
          ))}
        </section>

        {REVIEW_QUEUE_SECTIONS.map((section) => (
          <ReviewQueueSection
            key={section.key}
            title={section.title}
            description={section.description}
            groupKeys={section.groupKeys}
            groups={groups}
          />
        ))}
      </div>
    </main>
  );
}
