"use client";

import { useState } from "react";
import { AdminReadonlyNotice } from "@/components/admin/AdminReadonlyNotice";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";
import { useRosterAdminData } from "./useRosterAdminData";
import type { TeamRow } from "./types";

export default function ManualTeamManager({ readOnly = false }: { readOnly?: boolean }) {
  const { manualTeams, loadData } = useRosterAdminData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCode, setNewTeamCode] = useState("");

  async function createTeam() {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("수동 팀 관리"));
      return;
    }
    if (!newTeamName || !newTeamCode) {
      setMessage("팀 이름과 팀 코드를 모두 입력해주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
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
        setMessage(json?.message || "수동 팀 생성에 실패했습니다.");
        return;
      }
      setMessage("수동 팀을 생성했습니다.");
      setNewTeamName("");
      setNewTeamCode("");
      await loadData();
    } catch {
      setMessage("수동 팀 생성 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(team: TeamRow) {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("수동 팀 관리"));
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `${team.name} (${team.code}) 팀을 삭제하시겠습니까? 선수 수가 0명인 수동 팀만 삭제할 수 있습니다.`
          );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
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
        setMessage(json?.message || "수동 팀 삭제에 실패했습니다.");
        return;
      }
      setMessage("수동 팀을 삭제했습니다.");
      await loadData();
    } catch {
      setMessage("수동 팀 삭제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      {readOnly ? (
        <AdminReadonlyNotice body="현재 배포 환경에서는 수동 팀을 읽기 전용으로만 확인할 수 있습니다. 실제 생성과 삭제는 로컬 운영 경로에서 진행해주세요." />
      ) : null}

      <div>
        <h2 className="font-bold">수동 팀 관리</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          운영자가 직접 생성한 팀을 추가하거나, 선수 수가 0명일 때 안전하게 정리합니다.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        1. 새 팀 이름과 팀 코드를 입력합니다. 2. 생성 후 로스터 교정에서 선수 배치를 진행합니다. 3. 비어 있는 수동 팀만 삭제할 수 있습니다.
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-4 rounded-lg border border-border bg-background p-4">
          <div>
            <p className="text-sm font-semibold">새 수동 팀 생성</p>
            <p className="mt-1 text-xs text-muted-foreground">
              아직 수집되지 않지만 운영상 먼저 만들어야 하는 팀을 추가할 때 사용합니다.
            </p>
          </div>

          <input
            value={newTeamName}
            disabled={readOnly}
            onChange={(event) => setNewTeamName(event.target.value)}
            placeholder="팀 이름 예: 블루 아카이브"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={newTeamCode}
            disabled={readOnly}
            onChange={(event) => setNewTeamCode(event.target.value)}
            placeholder="팀 코드 예: bluearchive"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={createTeam}
            disabled={!newTeamName || !newTeamCode || saving || readOnly}
            className="w-full rounded-lg bg-nzu-green px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "생성 중..." : "수동 팀 생성"}
          </button>

          <div className="space-y-1 rounded-lg border border-border px-4 py-4 text-xs text-muted-foreground">
            <p>팀 이름은 홈페이지에서 노출될 실제 표시명입니다.</p>
            <p>팀 코드는 영문/숫자 기반의 내부 식별자여야 하며 중복되면 안 됩니다.</p>
            <p>생성 직후에는 선수 수가 0명이고, 이후 로스터 교정 화면에서 선수를 배치합니다.</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div>
            <p className="text-sm font-semibold">현재 수동 팀</p>
            <p className="mt-1 text-xs text-muted-foreground">
              선수 수가 0명인 팀만 삭제할 수 있습니다. 선수가 남아 있으면 먼저 이동시켜주세요.
            </p>
          </div>

          {manualTeams.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              등록된 수동 팀이 없습니다.
            </div>
          ) : (
            manualTeams.map((team) => (
              <div
                key={team.code}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {team.name} <span className="text-xs text-muted-foreground">({team.code})</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">현재 선수 수 {team.players}명</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteTeam(team)}
                  disabled={saving || team.players > 0 || readOnly}
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
