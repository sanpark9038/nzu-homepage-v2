// K-중만컵 티어 동결. site_settings KV 한 칸에 스냅샷을 통째로 넣는다.
// 런타임 import 없는 순수 모듈로 유지할 것 — 테스트가 이 파일을 transpile해서 바로 실행한다.

export const TIER_FREEZE_KEY = "jungman_tier_freeze";

export type TierFreeze = {
  active: boolean;
  frozenAt: string;
  snapshot: Record<string, string>; // player.id -> 동결 시점 tier 문자열(원본 그대로)
};

/** KV 원문 파싱. 깨진 값이면 조용히 null — 동결 하나 때문에 페이지가 죽으면 안 된다. */
export function parseTierFreeze(raw: string | null | undefined): TierFreeze | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as { active?: unknown; frozenAt?: unknown; snapshot?: unknown };
  if (value.active !== true) return null;
  if (!value.snapshot || typeof value.snapshot !== "object" || Array.isArray(value.snapshot)) return null;

  const snapshot: Record<string, string> = {};
  for (const [id, tier] of Object.entries(value.snapshot as Record<string, unknown>)) {
    if (typeof tier === "string" && tier.trim()) snapshot[id] = tier;
  }

  return {
    active: true,
    frozenAt: typeof value.frozenAt === "string" ? value.frozenAt : "",
    snapshot,
  };
}

/** 현재 선수 목록으로 동결 값을 만든다. 티어 없는 선수는 스냅샷에서 제외. */
export function buildTierFreezeValue(
  players: { id: string; tier: string | null }[],
  frozenAt: string
): string {
  const snapshot: Record<string, string> = {};
  for (const player of players) {
    if (!player?.id) continue;
    const tier = typeof player.tier === "string" ? player.tier.trim() : "";
    if (!tier) continue;
    snapshot[player.id] = player.tier as string;
  }

  return JSON.stringify({ active: true, frozenAt, snapshot });
}

/** 동결 티어가 라이브와 다를 때만 그 티어를 준다(변동 없는 선수는 null — 아무 표시도 안 한다). */
export function frozenTierOf(
  freeze: TierFreeze | null,
  playerId: string,
  liveTier: string | null | undefined
): string | null {
  if (!freeze) return null;

  const frozen = freeze.snapshot[playerId];
  if (!frozen) return null;
  if (frozen.trim() === String(liveTier ?? "").trim()) return null;

  return frozen;
}
