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

export const TIER_PLAYER_PAYLOAD_CORE_FIELDS = [
  "id",
  "name",
  "nickname",
  "race",
  "gender",
  "tier",
  "university",
  "is_live",
] as const satisfies ReadonlyArray<keyof TierPlayerPayload>;

export const TIER_PLAYER_PAYLOAD_OPTIONAL_FIELDS = [
  "broadcast_title",
  "channel_profile_image_url",
  "live_thumbnail_url",
  "photo_url",
] as const satisfies ReadonlyArray<keyof TierPlayerPayload>;

export type TierPlayerPayloadField =
  | (typeof TIER_PLAYER_PAYLOAD_CORE_FIELDS)[number]
  | (typeof TIER_PLAYER_PAYLOAD_OPTIONAL_FIELDS)[number];

export type PackedTierPlayerValue = string | boolean | null;
export type PackedTierPlayerPayload = PackedTierPlayerValue[];

export type PackedTierPlayersPayload = {
  liveOnly: boolean;
  fields: TierPlayerPayloadField[];
  players: PackedTierPlayerPayload[];
  generatedAt: string;
};

export type TierPlayersPayload = {
  liveOnly: boolean;
  players: TierPlayerPayload[];
  generatedAt: string;
};

const TIER_PLAYER_PAYLOAD_OPTIONAL_FIELD_SET = new Set<TierPlayerPayloadField>(TIER_PLAYER_PAYLOAD_OPTIONAL_FIELDS);

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

export function buildPackedTierPlayersPayload(
  players: Player[],
  options: { liveOnly: boolean; generatedAt: string }
): PackedTierPlayersPayload {
  const payloadPlayers = players.map(buildTierPlayerPayload);
  const optionalFields = TIER_PLAYER_PAYLOAD_OPTIONAL_FIELDS.filter((field) =>
    payloadPlayers.some((player) => Object.hasOwn(player, field))
  );
  const fields: TierPlayerPayloadField[] = [...TIER_PLAYER_PAYLOAD_CORE_FIELDS, ...optionalFields];

  return {
    liveOnly: options.liveOnly,
    fields,
    players: payloadPlayers.map((player) => fields.map((field) => player[field] ?? null)),
    generatedAt: options.generatedAt,
  };
}

export function unpackTierPlayersPayload(payload: PackedTierPlayersPayload): TierPlayersPayload {
  return {
    liveOnly: payload.liveOnly,
    players: payload.players.map((packedPlayer) => {
      const player: Partial<Record<TierPlayerPayloadField, PackedTierPlayerValue>> = {};

      payload.fields.forEach((field, index) => {
        const value = packedPlayer[index] ?? null;
        if (TIER_PLAYER_PAYLOAD_OPTIONAL_FIELD_SET.has(field) && value === null) return;
        player[field] = value;
      });

      return player as TierPlayerPayload;
    }),
    generatedAt: payload.generatedAt,
  };
}
