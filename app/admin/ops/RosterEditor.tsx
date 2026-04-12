"use client";

import { useEffect, useMemo, useState } from "react";

type ManualMode = "temporary" | "fixed";
type AdminTab = "move" | "exclude" | "team"; // recruit 제거


type PlayerRow = {
  entity_id: string;
  wr_id: number;
  gender: string;
  name: string;
  team_code: string;
  team_name: string;
  tier: string;
  race: string;
  manual_lock?: boolean;
  manual_mode?: ManualMode | null;
  excluded?: boolean;
  exclusion_reason?: string;
};

type TeamRow = {
  code: string;
  name: string;
  players: number;
  manual_managed?: boolean;
};

type ApiResponse = {
  ok: boolean;
  players: PlayerRow[];
  teams: TeamRow[];
};

const TIER_OPTIONS = ["갓", "킹", "잭", "조커", "스페이드", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function RosterEditor({ onRosterChange }: { onRosterChange?: () => void }) {
  const [tab, setTab] = useState<AdminTab>("move");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [tier, setTier] = useState("");
  const [manualMode, setManualMode] = useState<ManualMode>("temporary");
  const [excluded, setExcluded] = useState(false);
  const [exclusionReason, setExclusionReason] = useState("user_excluded");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCode, setNewTeamCode] = useState("");


  const selected = useMemo(() => players.find((p) => p.entity_id === selectedId) || null, [players, selectedId]);
  const selectedTeam = useMemo(() => teams.find((t) => t.code === teamCode) || null, [teams, teamCode]);
  const movePreview = selected
    ? {
        fromTeam: selected.team_name,
        fromTier: selected.tier,
        toTeam: selectedTeam?.name || selected.team_name,
        toTier: tier || selected.tier,
      }
    : null;
  const manualTeams = useMemo(
    () => teams.filter((team) => team.manual_managed),
    [teams]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) =>
        [
          p.name,
          String(p.wr_id),
          p.team_name,
          p.team_code,
          p.tier,
          p.race,
          p.manual_mode || "",
          p.exclusion_reason || "",
        ].some((v) => String(v).toLowerCase().includes(q))
      )
      .slice(0, 120);
  }, [players, query]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roster", { cache: "no-store" });
      const json = (await res.json()) as any;
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
    setManualMode(selected.manual_mode || "temporary");
    setExcluded(Boolean(selected.excluded));
    setExclusionReason(String(selected.exclusion_reason || "user_excluded"));
  }, [selected]);

  async function save() {
    if (!selected) return;
    if (!teamCode || !tier) {
      setMsg("소속과 티어를 모두 선택하세요.");
      return;
    }
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
          manual_mode: manualMode,
          excluded,
          exclusion_reason: exclusionReason,
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
  


  async function releaseOverride(kind: ManualMode) {
    if (!selected) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            kind === "temporary"
              ? "임시 수동을 해제하면 다음 자동 동기화부터 자동 기준으로 돌아갑니다. 계속할까요?"
              : "고정 수동을 해제하면 다음 자동 동기화부터 자동 기준으로 돌아갑니다. 계속할까요?"
          );
    if (!confirmed) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: selected.entity_id,
          clear_override: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "해제 실패");
        return;
      }
      setMsg(
        kind === "temporary"
          ? "임시 수동 해제 완료. 다음 자동 동기화부터 자동 기준이 적용됩니다."
          : "고정 수동 해제 완료. 다음 자동 동기화부터 자동 기준이 적용됩니다."
      );
      await loadData();
    } catch {
      setMsg("해제 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function clearExclusion() {
    if (!selected) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "수집 제외를 해제하면 다음 자동 파이프라인부터 다시 수집 대상에 들어갑니다. 계속할까요?"
          );
    if (!confirmed) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: selected.entity_id,
          clear_exclusion: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "제외 해제 실패");
        return;
      }
      setExcluded(false);
      setMsg("수집 제외 해제 완료");
      await loadData();
    } catch {
      setMsg("제외 해제 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function createTeam() {
    if (!newTeamName || !newTeamCode) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_team",
          team_name: newTeamName,
          team_code: newTeamCode,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "팀 생성 실패");
        return;
      }
      setMsg("새 수동 관리 팀 생성 완료");
      setNewTeamName("");
      setNewTeamCode("");
      await loadData();
    } catch {
      setMsg("팀 생성 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(team: TeamRow) {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `수동 팀 ${team.name} (${team.code}) 를 삭제합니다. 선수 0명인 경우에만 삭제됩니다. 계속할까요?`
          );
    if (!confirmed) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_team",
          team_code: team.code,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "팀 삭제 실패");
        return;
      }
      setMsg("수동 팀 삭제 완료");
      await loadData();
    } catch {
      setMsg("팀 삭제 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-border rounded-lg p-4 bg-card space-y-4">
      <div>
        <h2 className="font-bold">Roster Admin</h2>
        <p className="text-xs text-muted-foreground mt-1">자주 쓰는 작업만 먼저 보이는 단순한 운영 화면입니다.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setTab("move")}
          className={`rounded-lg border px-4 py-3 text-left transition ${
            tab === "move" ? "border-nzu-green bg-nzu-green/10" : "border-border bg-background"
          }`}
        >
          <p className="text-sm font-semibold">소속/티어 바꾸기</p>
          <p className="mt-1 text-xs text-muted-foreground">선수의 현재 소속과 티어를 수정합니다.</p>
        </button>
        <button
          type="button"
          onClick={() => setTab("exclude")}
          className={`rounded-lg border px-4 py-3 text-left transition ${
            tab === "exclude" ? "border-nzu-green bg-nzu-green/10" : "border-border bg-background"
          }`}
        >
          <p className="text-sm font-semibold">자동 수집에서 빼기</p>
          <p className="mt-1 text-xs text-muted-foreground">활동 없는 선수를 자동 수집에서 제외합니다.</p>
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`rounded-lg border px-4 py-3 text-left transition ${
            tab === "team" ? "border-nzu-green bg-nzu-green/10" : "border-border bg-background"
          }`}
        >
          <p className="text-sm font-semibold">새 팀 만들기</p>
          <p className="mt-1 text-xs text-muted-foreground">원본 사이트에 없는 새 팀을 직접 추가합니다.</p>
        </button>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        1. 선수 검색  2. 값 선택  3. 저장
      </div>

      {tab === "team" ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mx-auto max-w-xl space-y-4">
            <div>
              <p className="text-sm font-semibold">새 팀 만들기</p>
              <p className="mt-1 text-xs text-muted-foreground">
                원본 사이트에 아직 없는 소속 그룹을 먼저 만들고, 이후 선수 이동에서 바로 사용할 수 있습니다.
              </p>
            </div>

            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="팀 이름 예: 가나다"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <input
              value={newTeamCode}
              onChange={(e) => setNewTeamCode(e.target.value)}
              placeholder="팀 코드 예: ganada"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={createTeam}
              disabled={!newTeamName || !newTeamCode || saving}
              className="w-full rounded-lg bg-nzu-green px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "생성 중..." : "새 팀 만들기"}
            </button>

            <div className="rounded-lg border border-border px-4 py-4 text-xs text-muted-foreground space-y-1">
              <p>팀 이름: 홈페이지에 보일 이름입니다.</p>
              <p>팀 코드: 내부에서 쓰는 고유 코드입니다. 영어/숫자 조합이 안전합니다.</p>
              <p>생성된 팀은 자동 수집 팀이 아니라 수동 관리 팀으로 시작합니다.</p>
            </div>

            <div className="rounded-lg border border-border px-4 py-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">수동 팀 관리</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  선수 0명인 수동 팀만 삭제할 수 있습니다. 선수가 남아 있으면 먼저 다른 팀으로 옮겨야 합니다.
                </p>
              </div>
              {manualTeams.length === 0 ? (
                <p className="text-xs text-muted-foreground">현재 수동 팀이 없습니다.</p>
              ) : (
                manualTeams.map((team) => (
                  <div key={team.code} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {team.name} <span className="text-xs text-muted-foreground">({team.code})</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">현재 선수 {team.players}명</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteTeam(team)}
                      disabled={saving || team.players > 0}
                      className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">{tab === "move" ? "바꿀 선수 검색" : "제외할 선수 검색"}</p>
              <p className="mt-1 text-xs text-muted-foreground">검색어를 입력해야 결과가 보입니다.</p>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="선수명 / wr_id / 팀명 검색"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            />

            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {!query.trim() ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  검색어를 입력하면 선수 목록이 표시됩니다.
                </div>
              ) : loading ? (
                <div className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
              ) : (
                filtered.map((p) => {
                  const isActive = p.entity_id === selectedId;
                  return (
                    <button
                      key={p.entity_id}
                      type="button"
                      onClick={() => setSelectedId(p.entity_id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-nzu-green bg-nzu-green/10"
                          : "border-border bg-background hover:border-nzu-green/40 hover:bg-background/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {p.name} <span className="text-xs text-muted-foreground">({p.wr_id})</span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">현재 소속: {p.team_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">현재 티어: {p.tier} / 종족: {p.race}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[11px]">
                          {p.excluded ? <span className="rounded bg-zinc-700 px-2 py-1 text-white">제외</span> : null}
                          {p.manual_mode ? (
                            <span className="rounded bg-nzu-green/20 px-2 py-1 text-nzu-green">
                              {p.manual_mode === "temporary" ? "임시 수동" : "고정 수동"}
                            </span>
                          ) : (
                            <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">자동</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            {tab === "move" ? (
              <>
                <div>
                  <p className="text-sm font-semibold">소속/티어 바꾸기</p>
                  <p className="mt-1 text-xs text-muted-foreground">현재 상태를 보고 바꿀 소속과 티어를 정한 뒤 저장합니다.</p>
                </div>

                {selected ? (
                  <>
                    <div className="rounded-lg border border-border px-4 py-4">
                      <p className="text-base font-bold">{selected.name}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        현재 소속: {selected.team_name} / 현재 티어: {selected.tier} / 종족: {selected.race}
                      </p>
                    </div>

                    {movePreview ? (
                      <div className="rounded-lg border border-border bg-card px-4 py-4">
                        <p className="text-sm font-semibold">변경 미리보기</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          현재: {movePreview.fromTeam} / {movePreview.fromTier}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-nzu-green">
                          변경 후: {movePreview.toTeam} / {movePreview.toTier}
                        </p>
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={teamCode}
                        onChange={(e) => setTeamCode(e.target.value)}
                        className="bg-background border border-border rounded px-2 py-2 text-sm"
                        disabled={!selected}
                      >
                        <option value="">바꿀 소속 선택</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.name} ({t.code}) {t.manual_managed ? "· 수동팀" : ""}
                          </option>
                        ))}
                      </select>

                      <select
                        value={tier}
                        onChange={(e) => setTier(e.target.value)}
                        className="bg-background border border-border rounded px-2 py-2 text-sm"
                        disabled={!selected}
                      >
                        <option value="">바꿀 티어 선택</option>
                        {TIER_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-border px-4 py-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold">수동 설정</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          대부분은 `임시 수동`으로 저장하면 되고, 새 팀처럼 자동이 못 따라오는 경우만 `고정 수동`을 씁니다.
                        </p>
                      </div>

                      <select
                        value={manualMode}
                        onChange={(e) => setManualMode(e.target.value as ManualMode)}
                        className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                        disabled={!selected}
                      >
                        <option value="temporary">임시 수동</option>
                        <option value="fixed">고정 수동</option>
                      </select>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">임시 수동</p>
                          <p className="mt-1">자동 반영이 늦을 때 잠깐 직접 반영합니다.</p>
                        </div>
                        <div className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">고정 수동</p>
                          <p className="mt-1">새 팀처럼 자동이 못 따라오는 값을 계속 직접 관리합니다.</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => releaseOverride("temporary")}
                          disabled={!selected || !selected.manual_mode || selected.manual_mode !== "temporary" || saving}
                          className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          임시 수동 해제
                        </button>
                        <button
                          onClick={() => releaseOverride("fixed")}
                          disabled={!selected || !selected.manual_mode || selected.manual_mode !== "fixed" || saving}
                          className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          고정 수동 해제
                        </button>
                      </div>
                    </div>

                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    왼쪽에서 선수를 선택하세요.
                  </div>
                )}

                <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                  <button
                    onClick={save}
                    disabled={!selected || !teamCode || !tier || saving}
                    className="w-full rounded-lg bg-nzu-green px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold">자동 수집에서 빼기</p>
                  <p className="mt-1 text-xs text-muted-foreground">활동이 없는 선수는 자동 수집과 점검 리포트에서 제외합니다.</p>
                </div>

                {selected ? (
                  <>
                    <div className="rounded-lg border border-border px-4 py-4">
                      <p className="text-base font-bold">{selected.name}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        현재: {selected.team_name} / {selected.tier} / {selected.race}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        상태: {selected.excluded ? `수집 제외(${selected.exclusion_reason || "사유 없음"})` : "현재 제외 아님"}
                      </p>
                    </div>

                    <input
                      value={exclusionReason}
                      onChange={(e) => setExclusionReason(e.target.value)}
                      disabled={!selected}
                      placeholder="제외 사유 예: 활동 중단"
                      className="bg-background border border-border rounded px-2 py-2 text-sm"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm("이 선수를 자동 수집과 점검 리포트에서 제외합니다. 계속할까요?")
                          ) {
                            return;
                          }
                          setExcluded(true);
                          void (async () => {
                            setSaving(true);
                            setMsg("");
                            try {
                              const res = await fetch("/api/admin/roster", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "set_exclusion",
                                  entity_id: selected.entity_id,
                                  excluded: true,
                                  exclusion_reason: exclusionReason,
                                }),
                              });
                              const json = await res.json();
                              if (!res.ok) {
                                setMsg(json?.message || "제외 저장 실패");
                                return;
                              }
                              setMsg("수집 제외 저장 완료");
                              await loadData();
                            } catch {
                              setMsg("제외 저장 중 오류 발생");
                            } finally {
                              setSaving(false);
                            }
                          })();
                        }}
                        disabled={!selected || saving || selected.excluded}
                        className="rounded-lg bg-nzu-green px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving ? "저장 중..." : "이 선수 제외하기"}
                      </button>
                      <button
                        onClick={clearExclusion}
                        disabled={!selected || !selected.excluded || saving}
                        className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        제외 해제하기
                      </button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      제외하면 자동 파이프라인과 점검 리포트에서 빠집니다. 다시 활동하면 제외 해제를 누르면 됩니다.
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    왼쪽에서 선수를 선택하세요.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
    </section>
  );
}
