import type { Database } from "../lib/database.types";

export type Player = Database["public"]["Tables"]["players"]["Row"];
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
