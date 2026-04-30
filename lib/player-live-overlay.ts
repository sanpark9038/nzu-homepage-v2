import { type Player } from "../types";

const SOOP_DB_LIVE_MAX_AGE_MS = 15 * 60 * 1000;

type PlayerWithLiveState = Partial<Player> & {
  last_checked_at?: string | null;
};

function isFreshDbLiveState(checkedAt: string | null | undefined) {
  const checkedTime = Date.parse(String(checkedAt || "").trim());
  if (!Number.isFinite(checkedTime)) return false;
  const ageMs = Date.now() - checkedTime;
  return ageMs >= 0 && ageMs <= SOOP_DB_LIVE_MAX_AGE_MS;
}

function clearStaleLiveState<T extends PlayerWithLiveState>(player: T): T {
  if (player.is_live !== true) {
    if (!player.broadcast_title && !player.live_thumbnail_url) return player;
    return {
      ...player,
      broadcast_title: null,
      live_thumbnail_url: null,
    };
  }

  if (isFreshDbLiveState(player.last_checked_at)) return player;

  return {
    ...player,
    is_live: false,
    broadcast_title: null,
    live_thumbnail_url: null,
  };
}

export function applySoopLivePreviewToOne<T extends PlayerWithLiveState>(player: T): T {
  return clearStaleLiveState(player);
}

export function applySoopLivePreviews<T extends PlayerWithLiveState>(players: T[]) {
  return players.map((player) => applySoopLivePreviewToOne(player));
}
