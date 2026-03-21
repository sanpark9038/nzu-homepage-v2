"use client";

import { useEffect, useMemo, useState } from "react";

type PlayerRow = {
  entity_id: string;
  wr_id: number;
  gender: string;
  name: string;
  team_code: string;
  team_name: string;
  tier: string;
  race: string;
};

type TeamRow = {
  code: string;
  name: string;
  players: number;
};

type ApiResponse = {
  ok: boolean;
  players: PlayerRow[];
  teams: TeamRow[];
};

const TIER_OPTIONS = [
  "GOD",
  "KING",
  "JACK",
  "JOKER",
  "SPADE",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
];

export default function RosterEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [tier, setTier] = useState("");

  const selected = useMemo(() => players.find((p) => p.entity_id === selectedId) || null, [players, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players.slice(0, 100);
    return players
      .filter((p) =>
        [p.name, String(p.wr_id), p.team_name, p.team_code, p.tier, p.race].some((v) =>
          String(v).toLowerCase().includes(q)
        )
      )
      .slice(0, 100);
  }, [players, query]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roster", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      setPlayers(Array.isArray(json.players) ? json.players : []);
      setTeams(Array.isArray(json.teams) ? json.teams : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTeamCode(selected.team_code);
    setTier(String(selected.tier || ""));
  }, [selectedId, selected]);

  async function save() {
    if (!selected || !teamCode || !tier) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: selected.entity_id,
          team_code: teamCode,
          tier,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "저장 실패");
        return;
      }
      setMsg("저장 완료");
      await loadData();
    } catch {
      setMsg("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-border rounded-lg p-4 bg-card space-y-3">
      <h2 className="font-bold">Roster Quick Edit</h2>
      <p className="text-xs text-muted-foreground">
        선수 검색 후 소속/티어를 즉시 수정할 수 있습니다. 최근 100건만 표시됩니다.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="선수명 / wr_id / 팀명 검색"
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
      />

      <div className="grid md:grid-cols-2 gap-3">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="bg-background border border-border rounded px-2 py-2 text-sm"
          disabled={loading}
        >
          <option value="">{loading ? "로딩 중..." : "선수 선택"}</option>
          {filtered.map((p) => (
            <option key={p.entity_id} value={p.entity_id}>
              {p.name} ({p.wr_id}) | {p.team_name} | {p.tier}
            </option>
          ))}
        </select>

        <div className="text-xs text-muted-foreground border border-border rounded px-3 py-2">
          {selected ? (
            <div className="space-y-1">
              <p>
                선택: <b>{selected.name}</b> ({selected.wr_id})
              </p>
              <p>
                현재: {selected.team_name} / {selected.tier} / {selected.race}
              </p>
              <p className="truncate">id: {selected.entity_id}</p>
            </div>
          ) : (
            <p>선수를 선택하세요.</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <select
          value={teamCode}
          onChange={(e) => setTeamCode(e.target.value)}
          className="bg-background border border-border rounded px-2 py-2 text-sm"
          disabled={!selected}
        >
          <option value="">소속 선택</option>
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} ({t.code}) - {t.players}명
            </option>
          ))}
        </select>

        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="bg-background border border-border rounded px-2 py-2 text-sm"
          disabled={!selected}
        >
          <option value="">티어 선택</option>
          {TIER_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <button
          onClick={save}
          disabled={!selected || !teamCode || !tier || saving}
          className="px-3 py-2 rounded bg-nzu-green text-white text-sm font-bold disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
    </section>
  );
}

