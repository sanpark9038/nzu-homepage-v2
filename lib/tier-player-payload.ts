import type { Player } from "@/types";

export type TierPlayerPayload = {
  id: Player["id"];
  name: Player["name"];
  nickname: Player["nickname"];
  race: Player["race"];
  gender: Player["gender"];
  tier: Player["tier"];
  university: Player["university"];
  is_live: Player["is_live"];
  broadcast_title?: Player["broadcast_title"];
  channel_profile_image_url?: Player["channel_profile_image_url"];
  live_thumbnail_url?: Player["live_thumbnail_url"];
  photo_url?: Player["photo_url"];
};

export function buildTierPlayerPayload(player: Player): TierPlayerPayload {
  const payload: TierPlayerPayload = {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    race: player.race,
    gender: player.gender,
    tier: player.tier,
    university: player.university,
    is_live: player.is_live,
  };

  const channelProfileImageUrl = player.channel_profile_image_url || null;
  if (channelProfileImageUrl) {
    payload.channel_profile_image_url = channelProfileImageUrl;
  } else if (player.photo_url) {
    payload.photo_url = player.photo_url;
  }

  if (player.is_live) {
    if (player.broadcast_title) payload.broadcast_title = player.broadcast_title;
    if (player.live_thumbnail_url) payload.live_thumbnail_url = player.live_thumbnail_url;
  }

  return payload;
}
