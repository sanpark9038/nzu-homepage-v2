import type { Database } from "../lib/database.types";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
export type Player = Omit<PlayerRow, "match_history"> & {
  match_history?: PlayerRow["match_history"] | null;
};
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type EloMatch = Database["public"]["Tables"]["eloboard_matches"]["Row"];

export interface H2HStats {
  summary: {
    total: number;
    wins: number;
    losses: number;
    winRate: string;
    momentum90: {
      total: number;
      wins: number;
      losses: number;
      winRate: string;
    };
  };
  mapStats: Record<string, { w: number; l: number }>;
  recentMatches: EloMatch[];
}

export interface UniversityInfo {
  name: string;
  logo: string;
  color: string;
}
