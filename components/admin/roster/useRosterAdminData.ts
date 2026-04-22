"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerRow, TeamRow } from "./types";

export function useRosterAdminData() {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roster", { cache: "no-store" });
      const json = (await res.json()) as { players?: PlayerRow[]; teams?: TeamRow[] };
      setPlayers(Array.isArray(json.players) ? json.players : []);
      setTeams(Array.isArray(json.teams) ? json.teams : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const manualTeams = useMemo(
    () => teams.filter((team) => team.manual_managed),
    [teams]
  );

  return {
    loading,
    players,
    teams,
    manualTeams,
    loadData,
  };
}
