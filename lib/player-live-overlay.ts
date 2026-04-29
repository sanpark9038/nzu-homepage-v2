import { type Player } from "../types";

type SoopLivePreview = {
  isLive?: boolean;
  thumbnail?: string;
  title?: string;
  viewers?: string;
  nickname?: string;
  broad_start?: string;
};

type SoopLiveSnapshotDoc = {
  updated_at?: string;
  channels?: Record<string, SoopLivePreview>;
};

const SOOP_PREVIEW_LIVE_WINDOW_MS = 8 * 60 * 60 * 1000;
const SOOP_GENERATED_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
const SOOP_DB_LIVE_MAX_AGE_MS = 15 * 60 * 1000;

type PlayerWithLiveState = Partial<Player> & {
  soop_id?: string | null;
  last_checked_at?: string | null;
  live_viewers?: string | null;
  live_started_at?: string | null;
};

let cachedSoopLivePreviewMtimeMs: number | null = null;
let cachedSoopLivePreview = new Map<string, SoopLivePreview>();
let cachedSoopGeneratedSnapshotMtimeMs: number | null = null;
let cachedSoopGeneratedSnapshot = new Map<string, SoopLivePreview>();
let cachedSoopGeneratedSnapshotUpdatedAt: string | null = null;

function loadSoopLiveSnapshotFile(filePath: string, cacheKey: "preview" | "generated") {
  const snapshots = new Map<string, SoopLivePreview>();
  let updatedAt: string | null = null;
  if (typeof window !== "undefined") return { snapshots, updatedAt };

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  if (!fs.existsSync(filePath)) {
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = null;
      cachedSoopLivePreview = snapshots;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = null;
      cachedSoopGeneratedSnapshot = snapshots;
      cachedSoopGeneratedSnapshotUpdatedAt = null;
    }
    return { snapshots, updatedAt };
  }

  try {
    const stat = fs.statSync(filePath);
    if (cacheKey === "preview" && cachedSoopLivePreviewMtimeMs === stat.mtimeMs) {
      return { snapshots: cachedSoopLivePreview, updatedAt: null };
    }
    if (cacheKey === "generated" && cachedSoopGeneratedSnapshotMtimeMs === stat.mtimeMs) {
      return { snapshots: cachedSoopGeneratedSnapshot, updatedAt: cachedSoopGeneratedSnapshotUpdatedAt };
    }
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = stat.mtimeMs;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = stat.mtimeMs;
    }
  } catch {
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = null;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = null;
    }
  }

  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as SoopLiveSnapshotDoc;
    updatedAt = String(json?.updated_at || "").trim() || null;
    const channels = json && typeof json.channels === "object" ? json.channels : {};
    for (const [soopId, preview] of Object.entries(channels)) {
      const key = String(soopId || "").trim();
      if (!key || !preview || typeof preview !== "object") continue;
      snapshots.set(key, preview);
    }
  } catch {
    if (cacheKey === "preview") {
      cachedSoopLivePreview = snapshots;
    } else {
      cachedSoopGeneratedSnapshot = snapshots;
      cachedSoopGeneratedSnapshotUpdatedAt = updatedAt;
    }
    return { snapshots, updatedAt };
  }

  if (cacheKey === "preview") {
    cachedSoopLivePreview = snapshots;
  } else {
    cachedSoopGeneratedSnapshot = snapshots;
    cachedSoopGeneratedSnapshotUpdatedAt = updatedAt;
  }
  return { snapshots, updatedAt };
}

function loadSoopLivePreview() {
  const req = eval("require") as NodeRequire;
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "soop_live_preview.v1.json");
  return loadSoopLiveSnapshotFile(filePath, "preview").snapshots;
}

function loadSoopGeneratedLiveSnapshot() {
  const req = eval("require") as NodeRequire;
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "soop_live_snapshot.generated.v1.json");
  return loadSoopLiveSnapshotFile(filePath, "generated");
}

function isFreshGeneratedSnapshot(updatedAt: string | null) {
  const raw = String(updatedAt || "").trim();
  if (!raw) return false;
  const snapshotTime = new Date(raw);
  if (Number.isNaN(snapshotTime.getTime())) return false;
  const ageMs = Date.now() - snapshotTime.getTime();
  return ageMs >= 0 && ageMs <= SOOP_GENERATED_SNAPSHOT_MAX_AGE_MS;
}

function isFreshDbLiveState(checkedAt: string | null | undefined) {
  const checkedTime = Date.parse(String(checkedAt || "").trim());
  if (!Number.isFinite(checkedTime)) return false;
  const ageMs = Date.now() - checkedTime;
  return ageMs >= 0 && ageMs <= SOOP_DB_LIVE_MAX_AGE_MS;
}

function clearStaleLiveState<T extends PlayerWithLiveState>(player: T): T {
  if (player.is_live !== true) return player;
  if (isFreshDbLiveState(player.last_checked_at)) return player;

  return {
    ...player,
    is_live: false,
    broadcast_title: null,
    live_thumbnail_url: null,
    live_viewers: null,
    live_started_at: null,
  };
}

function resolveSoopLiveEntry(soopId: string) {
  const generated = loadSoopGeneratedLiveSnapshot();
  const generatedFresh = isFreshGeneratedSnapshot(generated.updatedAt);
  const generatedEntry = generated.snapshots.get(soopId);
  if (generatedFresh) {
    return {
      entry: generatedEntry || null,
      mode: "generated" as const,
      snapshotFresh: true,
    };
  }

  const previewEntry = loadSoopLivePreview().get(soopId);
  if (previewEntry) {
    return {
      entry: previewEntry,
      mode: "preview" as const,
      snapshotFresh: true,
    };
  }

  return {
    entry: null,
    mode: "unverified" as const,
    snapshotFresh: false,
  };
}

function normalizeSoopAssetUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

export function applySoopLivePreviewToOne<T extends PlayerWithLiveState>(player: T): T {
  const soopId = String(player?.soop_id || "").trim();
  if (!soopId) return clearStaleLiveState(player);
  const resolved = resolveSoopLiveEntry(soopId);
  if (!resolved.entry) {
    return clearStaleLiveState(player);
  }
  if (resolved.mode === "generated" && !resolved.snapshotFresh) {
    return clearStaleLiveState(player);
  }
  const preview = resolved.entry;

  const broadStartRaw = String(preview.broad_start || "").trim();
  const broadStart = broadStartRaw ? new Date(broadStartRaw.replace(" ", "T")) : null;
  const isFreshPreviewWindow =
    Boolean(preview.isLive) &&
    broadStart instanceof Date &&
    !Number.isNaN(broadStart.getTime()) &&
    Date.now() - broadStart.getTime() >= 0 &&
    Date.now() - broadStart.getTime() <= SOOP_PREVIEW_LIVE_WINDOW_MS;

  const hasExplicitSnapshot = true;
  const shouldApplyLivePreview =
    resolved.mode === "generated"
      ? Boolean(preview.isLive)
      : isFreshPreviewWindow || Boolean(preview.isLive);
  const fallbackIsLive = hasExplicitSnapshot ? false : player.is_live === true;
  const effectiveIsLive = shouldApplyLivePreview || fallbackIsLive;

  return {
    ...player,
    is_live: effectiveIsLive,
    broadcast_title: effectiveIsLive
      ? String(preview.title || "").trim() || player.broadcast_title
      : null,
    live_thumbnail_url: effectiveIsLive
      ? normalizeSoopAssetUrl(preview.thumbnail) || player.live_thumbnail_url
      : null,
    live_viewers: effectiveIsLive ? String(preview.viewers || "").trim() || null : null,
    live_started_at: effectiveIsLive ? broadStartRaw || null : null,
  };
}

export function applySoopLivePreviews<T extends PlayerWithLiveState>(players: T[]) {
  return players.map((player) => applySoopLivePreviewToOne(player));
}
