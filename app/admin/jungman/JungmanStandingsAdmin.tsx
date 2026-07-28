"use client";

import { useState } from "react";

const SCHEMA_EXAMPLE = `{
  "announced": true,
  "groups": [
    { "name": "A", "teams": ["팀1", "팀2", "팀3"] },
    { "name": "B", "teams": ["팀4", "팀5", "팀6"] }
  ],
  "matches": [
    { "group": "A", "home": "팀1", "away": "팀2", "homeSets": 2, "awaySets": 1 }
  ]
}`;

export default function JungmanStandingsAdmin({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    // 저장 버튼을 눌러야 서버까지 가는 왕복이 생긴다 — 형식 오류는 여기서 먼저 튕긴다
    const trimmed = value.trim();
    if (trimmed) {
      try {
        JSON.parse(trimmed);
      } catch (error) {
        setMessage(`JSON 형식이 올바르지 않습니다 — ${error instanceof Error ? error.message : "파싱 실패"}`);
        return;
      }
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/jungman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-standings", standings: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "저장에 실패했습니다.");
      setMessage(json.message || "저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-card p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-black tracking-tight text-white">조별 순위 데이터</h2>
        <p className="text-sm text-white/55">
          /jungman/standings에 그대로 반영됩니다. <code className="text-white/75">announced</code>가 false이거나
          비어 있으면 공개 화면은 &ldquo;조 편성 발표 전&rdquo;으로 남습니다. 세트 수가 같은 경기(0:0 포함)는 아직
          치르지 않은 경기로 보고 잔여로 셉니다.
        </p>
      </div>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={16}
        spellCheck={false}
        placeholder={SCHEMA_EXAMPLE}
        className="mt-4 w-full rounded-xl border border-white/10 bg-background px-3 py-2 font-mono text-xs leading-relaxed text-white"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black disabled:opacity-50"
        >
          조별 순위 저장
        </button>
        <button
          onClick={() => setValue(SCHEMA_EXAMPLE)}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white disabled:opacity-50"
        >
          예시 채우기
        </button>
        {message ? <span className="text-sm font-bold text-white/70">{message}</span> : null}
      </div>
    </section>
  );
}
