export type PlayerHistoryArtifactItem = {
  match_date?: string | null;
  opponent_entity_id?: string | null;
  opponent_name?: string | null;
  opponent_race?: string | null;
  map_name?: string | null;
  is_win?: boolean | null;
  result_text?: string | null;
  note?: string | null;
};

type PlayerHistoryLookupSource = {
  eloboard_id?: string | null;
};

type PlayerHistoryArtifact = {
  match_history?: PlayerHistoryArtifactItem[] | null;
};

export function buildHistoryArtifactKey(entityId: string | null | undefined) {
  const raw = String(entityId || "").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "";
}

function normalizeBaseUrl(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getPlayerHistoryPublicBaseUrl() {
  const explicit = normalizeBaseUrl(process.env.PLAYER_HISTORY_PUBLIC_BASE_URL);
  if (explicit) return explicit;
  const playerHistoryR2 = normalizeBaseUrl(process.env.PLAYER_HISTORY_R2_PUBLIC_BASE_URL);
  if (playerHistoryR2) return `${playerHistoryR2}/player-history`;
  const r2 = normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL);
  return r2 ? `${r2}/player-history` : "";
}

async function fetchRemoteArtifact(key: string): Promise<PlayerHistoryArtifact | null> {
  const baseUrl = getPlayerHistoryPublicBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(key)}.json`, {
      next: {
        revalidate: 300,
        tags: ["public-player-history"],
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as PlayerHistoryArtifact;
  } catch {
    return null;
  }
}

export async function loadPlayerHistoryArtifact(
  player: PlayerHistoryLookupSource
): Promise<PlayerHistoryArtifactItem[] | null> {
  const key = buildHistoryArtifactKey(player.eloboard_id);
  if (!key) return null;

  const remote = await fetchRemoteArtifact(key);
  const remoteHistory = Array.isArray(remote?.match_history) ? remote.match_history : null;
  if (remoteHistory && remoteHistory.length > 0) return remoteHistory;
  return null;
}
