"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UniversityEntry = {
  code: string;
  name: string;
  stars?: number;
  aliases?: string[];
  hidden?: boolean;
};

const EMPTY_FORM: UniversityEntry = {
  code: "",
  name: "",
  stars: undefined,
  aliases: [],
  hidden: false,
};

function normalizeAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export default function UniversityAdmin({ initialUniversities }: { initialUniversities: UniversityEntry[] }) {
  const [universities, setUniversities] = useState<UniversityEntry[]>(initialUniversities);
  const [drafts, setDrafts] = useState<Record<string, UniversityEntry>>({});
  const [newEntry, setNewEntry] = useState<UniversityEntry>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setUniversities(initialUniversities);
  }, [initialUniversities]);

  const sortedUniversities = useMemo(
    () => [...universities].sort((left, right) => left.code.localeCompare(right.code, "en")),
    [universities]
  );

  const loadUniversities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/universities", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "failed to load universities");
      setUniversities(json.universities || []);
      setDrafts({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "failed to load universities");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDraft = (code: string, patch: Partial<UniversityEntry>) => {
    setDrafts((prev) => {
      const base = prev[code] || universities.find((entry) => entry.code === code) || EMPTY_FORM;
      return {
        ...prev,
        [code]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const saveNewEntry = async () => {
    const payload = {
      ...newEntry,
      code: newEntry.code.trim().toUpperCase(),
      name: newEntry.name.trim(),
      aliases: Array.from(new Set([newEntry.code.trim().toUpperCase(), ...(newEntry.aliases || [])].filter(Boolean))),
    };

    if (!payload.code || !payload.name) {
      setMessage("code와 name을 먼저 입력해줘.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/universities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ university: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "failed to create university");
      setUniversities(json.universities || []);
      setNewEntry(EMPTY_FORM);
      setMessage(`${payload.code} 추가 완료`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "failed to create university");
    } finally {
      setLoading(false);
    }
  };

  const saveExisting = async (code: string) => {
    const draft = drafts[code] || universities.find((entry) => entry.code === code);
    if (!draft) return;

    const payload = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      aliases: Array.from(new Set([draft.code.trim().toUpperCase(), ...(draft.aliases || [])].filter(Boolean))),
    };

    setLoading(true);
    try {
      const res = await fetch("/api/admin/universities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ university: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "failed to update university");
      setUniversities(json.universities || []);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setMessage(`${payload.code} 저장 완료`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "failed to update university");
    } finally {
      setLoading(false);
    }
  };

  const deleteUniversity = async (code: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/universities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "failed to delete university");
      setUniversities(json.universities || []);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setMessage(`${code} 삭제 완료`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "failed to delete university");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-black tracking-tight text-white">새 대학 추가</h2>
          <p className="text-sm text-white/55">코드와 표시 이름을 넣으면 `/tier`와 `/entry` 학교 목록에 반영됩니다.</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_120px_minmax(0,1fr)_auto]">
          <input
            value={newEntry.code}
            onChange={(event) => setNewEntry((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
            placeholder="DM"
            className="rounded-xl border border-white/10 bg-background px-4 py-3 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
          />
          <input
            value={newEntry.name}
            onChange={(event) => setNewEntry((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="DM"
            className="rounded-xl border border-white/10 bg-background px-4 py-3 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
          />
          <input
            value={newEntry.stars ?? ""}
            onChange={(event) =>
              setNewEntry((prev) => ({
                ...prev,
                stars: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
            placeholder="0"
            type="number"
            min={0}
            className="rounded-xl border border-white/10 bg-background px-4 py-3 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
          />
          <input
            value={(newEntry.aliases || []).join(", ")}
            onChange={(event) => setNewEntry((prev) => ({ ...prev, aliases: normalizeAliases(event.target.value) }))}
            placeholder="DM, 디엠"
            className="rounded-xl border border-white/10 bg-background px-4 py-3 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
          />
          <button
            onClick={saveNewEntry}
            disabled={loading}
            className="rounded-xl bg-nzu-green px-5 py-3 text-sm font-black text-black disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white">기존 대학 관리</h2>
            <p className="text-sm text-white/55">삭제보다는 숨김을 먼저 쓰는 편이 운영상 안전합니다.</p>
          </div>
          <button
            onClick={loadUniversities}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70 hover:bg-white/5 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {sortedUniversities.map((entry) => {
            const draft = drafts[entry.code] || entry;
            return (
              <div key={entry.code} className="grid gap-3 rounded-2xl border border-white/8 bg-background/70 p-4 md:grid-cols-[110px_minmax(0,1fr)_110px_minmax(0,1fr)_110px_auto_auto]">
                <input
                  value={draft.code}
                  disabled
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-black text-white/40"
                />
                <input
                  value={draft.name}
                  onChange={(event) => updateDraft(entry.code, { name: event.target.value })}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
                />
                <input
                  value={draft.stars ?? ""}
                  onChange={(event) => updateDraft(entry.code, { stars: event.target.value ? Number(event.target.value) : undefined })}
                  type="number"
                  min={0}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
                />
                <input
                  value={(draft.aliases || []).join(", ")}
                  onChange={(event) => updateDraft(entry.code, { aliases: normalizeAliases(event.target.value) })}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white outline-none focus:border-nzu-green/40"
                />
                <label className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.hidden)}
                    onChange={(event) => updateDraft(entry.code, { hidden: event.target.checked })}
                  />
                  숨김
                </label>
                <button
                  onClick={() => saveExisting(entry.code)}
                  disabled={loading}
                  className="rounded-xl bg-nzu-green px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  onClick={() => deleteUniversity(entry.code)}
                  disabled={loading || entry.code === "FA"}
                  className="rounded-xl border border-red-500/25 px-4 py-2 text-sm font-black text-red-300 disabled:opacity-30"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {message ? <p className="text-sm font-bold text-nzu-green">{message}</p> : null}
    </div>
  );
}
