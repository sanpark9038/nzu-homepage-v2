import type { Database } from "../lib/database.types";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
export type Player = Omit<PlayerRow, "match_history" | "channel_profile_image_url" | "live_thumbnail_url"> & {
  channel_profile_image_url?: PlayerRow["channel_profile_image_url"] | null;
  live_thumbnail_url?: PlayerRow["live_thumbnail_url"] | null;
  live_viewers?: string | null;
  live_started_at?: string | null;
  match_history?: PlayerRow["match_history"] | null;
  profile_url?: string | null;
};
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type EloMatch = Database["public"]["Tables"]["eloboard_matches"]["Row"];

export interface H2HStats {
  summary: {
    total: number;
    wins: number;
    losses: number;
    winRate: string;
    olderHistoryExists?: boolean;
    momentum90: {
      total: number;
      wins: number;
      losses: number;
      winRate: string;
    };
  };
  mapStats: Record<string, { w: number; l: number }>;
  recentMatches: EloMatch[];
  /** 상대 종족을 상대로 한 통산 전적(H2H 아님). race는 '상대방'의 종족. */
  raceEdge?: {
    p1: { race: string; wins: number; losses: number } | null;
    p2: { race: string; wins: number; losses: number } | null;
  };
}

export interface UniversityInfo {
  name: string;
  stars?: number;
}
