"use client";

export type ManualMode = "temporary" | "fixed";

export type PlayerRow = {
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

export type TeamRow = {
  code: string;
  name: string;
  players: number;
  manual_managed?: boolean;
};
