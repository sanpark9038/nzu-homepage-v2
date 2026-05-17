"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  actionHref: string;
  actionLabel: string;
  entityId: string;
  name: string;
  reviewKind: string;
  observedFrom: string;
  observedTo: string;
};

export default function RosterReviewDecisionButtons({
  actionHref,
  actionLabel,
  entityId,
  name,
  reviewKind,
  observedFrom,
  observedTo,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function exclude() {
    if (saving) return;
    setSaving(true);
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
      setMessage("제외되었습니다.");
      router.refresh();
    } catch {
      setMessage("제외 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Link href={actionHref} className="rounded-md bg-nzu-green px-3 py-2 text-xs font-bold text-white">
          {actionLabel}
        </Link>
        <button
          type="button"
          onClick={exclude}
          disabled={saving}
          className="rounded-md border border-border px-3 py-2 text-xs font-bold text-muted-foreground disabled:opacity-50"
        >
          {saving ? "제외 중" : "제외"}
        </button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
