"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminReadonlyNotice } from "@/components/admin/AdminReadonlyNotice";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";
import type { ManualMode } from "./types";
import { useRosterAdminData } from "./useRosterAdminData";

const TIER_OPTIONS = ["갓", "킹", "잭", "조커", "스페이드", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function RosterCorrectionEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { loading, players, teams, loadData } = useRosterAdminData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"move" | "exclude">("move");
  const [selectedId, setSelectedId] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [tier, setTier] = useState("");
  const [manualMode, setManualMode] = useState<ManualMode>("temporary");
  const [excluded, setExcluded] = useState(false);
  const [exclusionReason, setExclusionReason] = useState("user_excluded");

  const selected = useMemo(
    () => players.find((player) => player.entity_id === selectedId) || null,
    [players, selectedId]
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.code === teamCode) || null,
    [teams, teamCode]
  );

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return players
      .filter((player) =>
        [
          player.name,
          String(player.wr_id),
          player.team_name,
          player.team_code,
          player.tier,
          player.race,
          player.manual_mode || "",
          player.exclusion_reason || "",
        ].some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
      .slice(0, 120);
  }, [players, query]);

  const movePreview = selected
    ? {
        fromTeam: selected.team_name,
        fromTier: selected.tier,
        toTeam: selectedTeam?.name || selected.team_name,
        toTier: manualMode === "fixed" ? selected.tier : tier || selected.tier,
      }
    : null;

  useEffect(() => {
    if (!selected) return;
    setTeamCode(selected.team_code);
    setTier(String(selected.tier || ""));
    setManualMode(selected.manual_mode || "temporary");
    setExcluded(Boolean(selected.excluded));
    setExclusionReason(String(selected.exclusion_reason || "user_excluded"));
  }, [selected]);

  async function saveMove() {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("로스터 교정"));
      return;
    }
    if (!selected) return;
    if (!teamCode) {
      setMessage("이동할 팀과 티어를 모두 선택해주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: selected.entity_id,
          team_code: teamCode,
          tier: manualMode === "fixed" ? "" : tier,
          manual_mode: manualMode,
          excluded,
          exclusion_reason: exclusionReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.message || "로스터 교정 저장에 실패했습니다.");
        return;
      }
      setMessage("선수 교정 내용을 저장했습니다.");
      await loadData();
    } catch {
      setMessage("로스터 교정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function releaseOverride(kind: ManualMode) {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("로스터 교정"));
      return;
    }
    if (!selected) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            kind === "temporary"
              ? "임시 수동 교정을 해제하시겠습니까? 다음 파이프라인부터 자동 수집 결과가 다시 적용됩니다."
              : "고정 수동 교정을 해제하시겠습니까? 이후에는 자동 수집 결과가 다시 반영됩니다."
          );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
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
        setMessage(json?.message || "수동 교정 해제에 실패했습니다.");
        return;
      }
      setMessage(kind === "temporary" ? "임시 수동 교정을 해제했습니다." : "고정 수동 교정을 해제했습니다.");
      await loadData();
    } catch {
      setMessage("수동 교정 해제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function applyExclusion() {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("로스터 교정"));
      return;
    }
    if (!selected) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("이 선수를 수집 제외 상태로 저장하시겠습니까?");
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
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
        setMessage(json?.message || "수집 제외 저장에 실패했습니다.");
        return;
      }
      setMessage("선수를 수집 제외 상태로 저장했습니다.");
      await loadData();
    } catch {
      setMessage("수집 제외 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function clearExclusion() {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("로스터 교정"));
      return;
    }
    if (!selected) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("이 선수의 수집 제외 상태를 해제하시겠습니까?");
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
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
        setMessage(json?.message || "수집 제외 해제에 실패했습니다.");
        return;
      }
      setExcluded(false);
      setMessage("수집 제외 상태를 해제했습니다.");
      await loadData();
    } catch {
      setMessage("수집 제외 해제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      {readOnly ? (
        <AdminReadonlyNotice body="현재 배포 환경에서는 로스터를 읽기 전용으로만 확인할 수 있습니다. 실제 교정 저장은 로컬 운영 경로에서 진행해주세요." />
      ) : null}

      <div>
        <h2 className="font-bold">로스터 교정</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          선수 소속, 티어, 수동 모드, 수집 제외 여부를 운영 기준에 맞춰 직접 교정합니다.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("move")}
          className={`rounded-lg border px-4 py-3 text-left transition ${
            mode === "move" ? "border-nzu-green bg-nzu-green/10" : "border-border bg-background"
          }`}
        >
          <p className="text-sm font-semibold">소속/티어 교정</p>
          <p className="mt-1 text-xs text-muted-foreground">
            팀 이동, 티어 조정, 수동 모드 설정을 함께 저장합니다.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("exclude")}
          className={`rounded-lg border px-4 py-3 text-left transition ${
            mode === "exclude" ? "border-nzu-green bg-nzu-green/10" : "border-border bg-background"
          }`}
        >
          <p className="text-sm font-semibold">수집 제외/복구</p>
          <p className="mt-1 text-xs text-muted-foreground">
            수집 대상에서 잠시 제외하거나 운영 판단에 따라 다시 복구합니다.
          </p>
        </button>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        1. 선수를 검색합니다. 2. 교정 또는 제외 작업을 선택합니다. 3. 저장하면 다음 파이프라인에서도 이 값을 우선 참고합니다.
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div>
            <p className="text-sm font-semibold">
              {mode === "move" ? "교정할 선수 검색" : "제외/복구할 선수 검색"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              이름, `wr_id`, 팀명, 팀코드, 티어, 종족, 수동 모드, 제외 사유로 검색할 수 있습니다.
            </p>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="선수명 / wr_id / 팀명으로 검색"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {!query.trim() ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                검색어를 입력하면 선수를 찾을 수 있습니다.
              </div>
            ) : loading ? (
              <div className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                불러오는 중입니다...
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isActive = player.entity_id === selectedId;
                return (
                  <button
                    key={player.entity_id}
                    type="button"
                    onClick={() => setSelectedId(player.entity_id)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                      isActive
                        ? "border-nzu-green bg-nzu-green/10"
                        : "border-border bg-background hover:border-nzu-green/40 hover:bg-background/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {player.name} <span className="text-xs text-muted-foreground">({player.wr_id})</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">현재 소속: {player.team_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          현재 티어: {player.tier} / 종족: {player.race}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px]">
                        {player.excluded ? (
                          <span className="rounded bg-zinc-700 px-2 py-1 text-white">제외</span>
                        ) : null}
                        {player.manual_mode ? (
                          <span className="rounded bg-nzu-green/20 px-2 py-1 text-nzu-green">
                            {player.manual_mode === "temporary" ? "임시 수동" : "고정 수동"}
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

        <div className="space-y-4 rounded-lg border border-border bg-background p-4">
          {mode === "move" ? (
            <>
              <div>
                <p className="text-sm font-semibold">소속/티어 교정</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  선택한 선수의 소속, 티어, 수동 모드를 운영 기준으로 저장합니다.
                </p>
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
                      onChange={(event) => setTeamCode(event.target.value)}
                      className="rounded border border-border bg-background px-2 py-2 text-sm"
                      disabled={!selected || readOnly}
                    >
                      <option value="">이동할 팀 선택</option>
                      {teams.map((team) => (
                        <option key={team.code} value={team.code}>
                          {team.name} ({team.code}) {team.manual_managed ? "· 수동 팀" : ""}
                        </option>
                      ))}
                    </select>

                    <select
                      value={tier}
                      onChange={(event) => setTier(event.target.value)}
                      className="rounded border border-border bg-background px-2 py-2 text-sm"
                      disabled={!selected || readOnly}
                    >
                      <option value="">변경할 티어 선택</option>
                      {TIER_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4 rounded-lg border border-border px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold">수동 교정 모드</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        임시 수동은 다음 자동 보정 전까지 유지되고, 고정 수동은 직접 해제하기 전까지 운영 기준으로 남습니다.
                      </p>
                    </div>

                    <select
                      value={manualMode}
                      onChange={(event) => setManualMode(event.target.value as ManualMode)}
                      className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                      disabled={!selected || readOnly}
                    >
                      <option value="temporary">임시 수동</option>
                      <option value="fixed">고정 수동</option>
                    </select>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">임시 수동</p>
                        <p className="mt-1">다음 검토 전까지 잠시 우선 적용하고 싶을 때 사용합니다.</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">고정 수동</p>
                        <p className="mt-1">운영자가 다시 해제하기 전까지 계속 유지해야 할 기준일 때 사용합니다.</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => releaseOverride("temporary")}
                        disabled={!selected || selected.manual_mode !== "temporary" || saving || readOnly}
                        className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        임시 수동 해제
                      </button>
                      <button
                        onClick={() => releaseOverride("fixed")}
                        disabled={!selected || selected.manual_mode !== "fixed" || saving || readOnly}
                        className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        고정 수동 해제
                      </button>
                    </div>
                  </div>

                  <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                    <button
                      onClick={saveMove}
                      disabled={!selected || !teamCode || !tier || saving || readOnly}
                      className="w-full rounded-lg bg-nzu-green px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {saving ? "저장 중..." : "교정 내용 저장"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  왼쪽 목록에서 선수를 먼저 선택해주세요.
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold">수집 제외 관리</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  수집에 섞이면 안 되는 선수를 제외하고, 필요할 때 다시 복구합니다.
                </p>
              </div>

              {selected ? (
                <>
                  <div className="rounded-lg border border-border px-4 py-4">
                    <p className="text-base font-bold">{selected.name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      현재 소속: {selected.team_name} / 현재 티어: {selected.tier} / 종족: {selected.race}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      현재 상태:{" "}
                      {selected.excluded
                        ? `수집 제외 (${selected.exclusion_reason || "사유 없음"})`
                        : "수집 대상"}
                    </p>
                  </div>

                  <input
                    value={exclusionReason}
                    onChange={(event) => setExclusionReason(event.target.value)}
                    disabled={!selected || readOnly}
                    placeholder="제외 사유 또는 운영 메모"
                    className="rounded border border-border bg-background px-2 py-2 text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={applyExclusion}
                      disabled={!selected || saving || selected.excluded || readOnly}
                      className="rounded-lg bg-nzu-green px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {saving ? "처리 중..." : "수집 제외 저장"}
                    </button>
                    <button
                      onClick={clearExclusion}
                      disabled={!selected || !selected.excluded || saving || readOnly}
                      className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      수집 제외 해제
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    제외를 해제하면 다음 파이프라인부터 다시 자동 수집 대상에 포함됩니다.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  왼쪽 목록에서 선수를 먼저 선택해주세요.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
