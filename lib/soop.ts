type SoopPlayerLike = {
  soop_id?: string | null;
  broadcast_url?: string | null;
  channel_profile_image_url?: string | null;
  live_thumbnail_url?: string | null;
};

export function buildSoopChannelUrl(soopId: string | null | undefined) {
  const value = String(soopId || "").trim();
  return value ? `https://ch.sooplive.co.kr/${value}` : null;
}

export function buildSoopPlayUrl(soopId: string | null | undefined) {
  const value = String(soopId || "").trim();
  return value ? `https://play.sooplive.com/${value}/` : null;
}

export function buildSoopStimgProfileImageUrl(soopId: string | null | undefined) {
  const value = String(soopId || "").trim();
  if (!value) return null;
  const prefix = value.slice(0, 2).toLowerCase();
  return prefix ? `https://stimg.sooplive.com/LOGO/${prefix}/${value}/m/${value}.webp` : null;
}

export function buildSoopProfileImageUrlCoKr(soopId: string | null | undefined) {
  const value = String(soopId || "").trim();
  if (!value) return null;
  const prefix = value.slice(0, 2).toLowerCase();
  return prefix ? `https://profile.img.sooplive.co.kr/LOGO/${prefix}/${value}/${value}.jpg` : null;
}

export function buildSoopProfileImageUrl(soopId: string | null | undefined) {
  const value = String(soopId || "").trim();
  return value ? `https://profile.img.sooplive.com/LOGO/af/${value}/${value}.jpg` : null;
}

export function normalizeSoopImageUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

export function resolveSoopChannelUrl(player: SoopPlayerLike) {
  return buildSoopChannelUrl(player?.soop_id);
}

export function resolveSoopWatchUrl(player: SoopPlayerLike) {
  return buildSoopPlayUrl(player?.soop_id) || resolveSoopChannelUrl(player);
}

export function resolveSoopChannelImageUrl(player: SoopPlayerLike) {
  return (
    buildSoopProfileImageUrlCoKr(player?.soop_id) ||
    normalizeSoopImageUrl(player?.channel_profile_image_url) ||
    buildSoopStimgProfileImageUrl(player?.soop_id) ||
    buildSoopProfileImageUrl(player?.soop_id)
  );
}

export function resolveSoopLiveThumbnailUrl(player: SoopPlayerLike) {
  const value = String(player?.live_thumbnail_url || "").trim();
  return value || null;
}

export function buildSoopThumbnailProxyUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const params = new URLSearchParams({ src: raw });
  return `/api/soop/thumbnail?${params.toString()}`;
}
