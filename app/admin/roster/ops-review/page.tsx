import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { buildRosterOpsReview, type RosterOpsReviewPlayer } from "@/lib/admin-roster-ops-review";
import LogoutButton from "../../ops/LogoutButton";

export const dynamic = "force-dynamic";

function PlayerList({ items }: { items: RosterOpsReviewPlayer[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Player</th>
            <th className="p-2 text-left">Team</th>
            <th className="p-2 text-left">Tier</th>
            <th className="p-2 text-left">Reason</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 80).map((item, index) => (
            <tr key={item.entity_id || `${item.name}-${index}`} className="border-t border-border/60">
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
        <p className="px-2 py-3 text-xs text-muted-foreground">Showing first 80 of {items.length} items.</p>
      ) : null}
    </div>
  );
}

function JsonList({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items.</p>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 40).map((item, index) => (
        <pre
          key={index}
          className="max-h-40 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground"
        >
          {JSON.stringify(item, null, 2)}
        </pre>
      ))}
      {items.length > 40 ? <p className="text-xs text-muted-foreground">Showing first 40 of {items.length} items.</p> : null}
    </div>
  );
}

function ReviewSection({
  title,
  count,
  source,
  children,
}: {
  title: string;
  count: number;
  source: string | null;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-border bg-card p-4" open={count > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span className="font-bold">{title}</span>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground">{count}</span>
      </summary>
      <div className="mt-4 space-y-3">
        {source ? <p className="text-xs text-muted-foreground">Source: {source}</p> : null}
        {children}
      </div>
    </details>
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
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Roster Ops Review</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Read-only checklist for roster metadata, collection exclusions, and latest local pipeline reports.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/roster"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground"
            >
              Roster Management
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-5">
          {Object.values(groups).map((group) => (
            <div key={group.key} className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-black">{group.count}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">{group.title}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <ReviewSection
            title={groups.new_player_candidates.title}
            count={groups.new_player_candidates.count}
            source={groups.new_player_candidates.source}
          >
            <JsonList items={groups.new_player_candidates.items} />
          </ReviewSection>

          <ReviewSection
            title={groups.missing_soop_ids.title}
            count={groups.missing_soop_ids.count}
            source={groups.missing_soop_ids.source}
          >
            <PlayerList items={groups.missing_soop_ids.items} />
          </ReviewSection>

          <ReviewSection
            title={groups.zero_record_players.title}
            count={groups.zero_record_players.count}
            source={groups.zero_record_players.source}
          >
            <PlayerList items={groups.zero_record_players.items} />
          </ReviewSection>

          <ReviewSection
            title={groups.roster_change_review.title}
            count={groups.roster_change_review.count}
            source={groups.roster_change_review.source}
          >
            <JsonList items={groups.roster_change_review.items} />
          </ReviewSection>

          <ReviewSection
            title={groups.excluded_players.title}
            count={groups.excluded_players.count}
            source={groups.excluded_players.source}
          >
            <PlayerList items={groups.excluded_players.items} />
          </ReviewSection>
        </section>
      </div>
    </main>
  );
}
