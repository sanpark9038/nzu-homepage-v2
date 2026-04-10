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
  stars?: number;
}
