"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  actionLabel: string;
  entityId: string;
  name: string;
  reviewKind: string;
  observedFrom: string;
  observedTo: string;
};

const TEAM_CHANGE_KINDS = new Set(["affiliation_change", "new_candidate"]);

export default function RosterReviewDecisionButtons({
  actionLabel,
  entityId,
  name,
  reviewKind,
  observedFrom,
  observedTo,
}: Props) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [soopUserId, setSoopUserId] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  const isTeamChange = TEAM_CHANGE_KINDS.has(reviewKind);

  async function apply() {
    if (applying || done) return;
    setApplying(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/roster/ops-review/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: entityId,
          name,
          review_kind: reviewKind,
          observed_to: observedTo,
          soop_user_id: soopUserId.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json?.message || "저장에 실패했습니다.");
        return;
      }
      setDone(true);
      setMessage("반영됐습니다.");
      router.refresh();
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setApplying(false);
    }
  }

  async function exclude() {
    if (excluding || done) return;
    setExcluding(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/roster/ops-review/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exclude",
          entity_id: entityId,
          name,
          review_kind: reviewKind,
          observed_from: observedFrom,
          observed_to: observedTo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json?.message || "제외 저장에 실패했습니다.");
        return;
      }
      setDone(true);
      setMessage("제외됐습니다.");
      router.refresh();
    } catch {
      setMessage("제외 저장 중 오류가 발생했습니다.");
    } finally {
      setExcluding(false);
    }
  }

  if (done) {
    return <p className="text-xs font-bold text-nzu-green">{message}</p>;
  }

  return (
    <div className="space-y-2">
      {isTeamChange && (
        <input
          type="text"
          value={soopUserId}
          onChange={(e) => setSoopUserId(e.target.value)}
          placeholder="숲 ID (선택)"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-nzu-green/50"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={applying}
          className="rounded-md bg-nzu-green px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
        >
          {applying ? "저장 중…" : actionLabel}
        </button>
        <button
          type="button"
          onClick={exclude}
          disabled={excluding}
          className="rounded-md border border-border px-3 py-2 text-xs font-bold text-muted-foreground disabled:opacity-50"
        >
          {excluding ? "제외 중…" : "제외"}
        </button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
