import { randomBytes } from "node:crypto";

import type { PublicAuthSession } from "@/lib/public-auth";

export const SOOP_AUTH_STATE_COOKIE = "nzu_soop_auth_state";
export const SOOP_AUTH_DEFAULT_NEXT_PATH = "/board";
export const SOOP_AUTH_URL = "https://openapi.sooplive.com/auth/code";
export const SOOP_TOKEN_URL = "https://openapi.sooplive.com/auth/token";
export const SOOP_USERINFO_URL = "https://openapi.sooplive.com/user/stationinfo";

type SoopTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string | null;
};

type SoopStationInfoResponse = {
  result?: number;
  data?: Record<string, unknown> | null;
};

const USER_ID_CANDIDATE_KEYS = [
  "user_id",
  "userId",
  "bjid",
  "bj_id",
  "station_id",
  "stationId",
  "id",
  "station_url",
] as const;
const DISPLAY_NAME_CANDIDATE_KEYS = ["user_nick", "nickname", "nick_name", "user_nick_name", "station_name", "name"] as const;
const AVATAR_CANDIDATE_KEYS = ["profile_image", "profile_img", "profile_image_url", "avatar", "avatar_url"] as const;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function getSoopClientId() {
  return normalizeText(process.env.SOOP_CLIENT_ID);
}

export function getSoopClientSecret() {
  return normalizeText(process.env.SOOP_CLIENT_SECRET);
}

export function getSoopRedirectUri() {
  const explicit = normalizeText(process.env.SOOP_REDIRECT_URI);
  if (explicit) return explicit;
  return "http://localhost:3000/api/auth/soop/callback";
}

export function isSoopOAuthConfigured() {
  return Boolean(getSoopClientId() && getSoopClientSecret() && getSoopRedirectUri());
}

export function createSoopState(nextPath = SOOP_AUTH_DEFAULT_NEXT_PATH) {
  const nonce = randomBytes(12).toString("base64url");
  return `${nonce}:${normalizeNextPath(nextPath)}`;
}

export function normalizeNextPath(value: unknown) {
  const text = normalizeText(value);
  if (!text.startsWith("/")) return SOOP_AUTH_DEFAULT_NEXT_PATH;
  if (text.startsWith("//")) return SOOP_AUTH_DEFAULT_NEXT_PATH;
  if (text.includes("\\")) return SOOP_AUTH_DEFAULT_NEXT_PATH;

  try {
    const baseOrigin = "https://nzu.local";
    const url = new URL(text, baseOrigin);
    if (url.origin !== baseOrigin) return SOOP_AUTH_DEFAULT_NEXT_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return SOOP_AUTH_DEFAULT_NEXT_PATH;
  }
}

export function buildSoopAuthorizationUrl(state: string) {
  const url = new URL(SOOP_AUTH_URL);
  url.searchParams.set("client_id", getSoopClientId());
  url.searchParams.set("redirect_uri", getSoopRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSoopAuthorizationCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getSoopClientId(),
    client_secret: getSoopClientSecret(),
    redirect_uri: getSoopRedirectUri(),
    code,
  });

  const response = await fetch(SOOP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as SoopTokenResponse & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`soop_token_exchange_failed:${response.status}`);
  }

  return payload;
}

export async function fetchSoopStationInfo(accessToken: string) {
  const body = new URLSearchParams({
    access_token: normalizeText(accessToken),
  });

  const response = await fetch(SOOP_USERINFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as SoopStationInfoResponse & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`soop_userinfo_failed:${response.status}`);
  }

  return payload;
}

function pickString(payload: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = normalizeText(payload[key]);
    if (value) return value;
  }
  return "";
}

function extractProviderUserId(profile: Record<string, unknown>) {
  const direct = pickString(profile, USER_ID_CANDIDATE_KEYS);
  if (direct) return direct;

  const stationUrl = normalizeText(profile.station_url);
  if (stationUrl) {
    try {
      const url = new URL(stationUrl);
      const stationId = url.pathname.split("/").filter(Boolean).pop();
      if (stationId) return stationId;
    } catch {
      const match = stationUrl.match(/station\/([^/?#]+)/i);
      if (match && match[1]) return match[1];
    }
  }

  const profileImage = pickString(profile, AVATAR_CANDIDATE_KEYS);
  if (profileImage) {
    const normalizedProfileImage = profileImage.startsWith("//") ? `https:${profileImage}` : profileImage;
    try {
      const url = new URL(normalizedProfileImage);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const directoryCandidate = parts[parts.length - 2];
        const fileCandidate = parts[parts.length - 1].replace(/\.[^.]+$/, "");
        if (directoryCandidate && fileCandidate && directoryCandidate === fileCandidate) {
          return directoryCandidate;
        }
      }
    } catch {
      const match = normalizedProfileImage.match(/\/([^/?#./]+)\/\1\.[a-z0-9]+(?:$|[?#])/i);
      if (match && match[1]) return match[1];
    }
  }

  return "";
}

function buildSessionFieldCandidates(profilePayload: SoopStationInfoResponse) {
  const profile = (profilePayload && profilePayload.data && typeof profilePayload.data === "object"
    ? profilePayload.data
    : {}) as Record<string, unknown>;

  const providerUserId = extractProviderUserId(profile);
  const displayName = pickString(profile, DISPLAY_NAME_CANDIDATE_KEYS);
  const avatarUrl = pickString(profile, AVATAR_CANDIDATE_KEYS) || null;

  return {
    profile,
    providerUserId,
    displayName,
    avatarUrl,
  };
}

export function buildPublicSessionFromSoopProfile(profilePayload: SoopStationInfoResponse) {
  const { providerUserId, displayName, avatarUrl } = buildSessionFieldCandidates(profilePayload);

  if (!providerUserId || !displayName) return null;

  return {
    provider: "soop",
    providerUserId,
    displayName,
    avatarUrl,
  } satisfies PublicAuthSession;
}

export function describeSoopTokenShape(tokenPayload: SoopTokenResponse) {
  const accessToken = normalizeText(tokenPayload.access_token);

  return {
    token_response_keys: Object.keys(tokenPayload || {}).sort(),
    access_token_present: Boolean(accessToken),
    access_token_length: accessToken.length,
    access_token_parts: accessToken ? accessToken.split(".").length : 0,
  };
}

export function describeSoopUserInfoShape(profilePayload: SoopStationInfoResponse) {
  const { profile, providerUserId, displayName, avatarUrl } = buildSessionFieldCandidates(profilePayload);
  return {
    result: profilePayload?.result ?? null,
    data_keys: Object.keys(profile || {}).sort(),
    candidate_presence: {
      providerUserId: Boolean(providerUserId),
      displayName: Boolean(displayName),
      avatarUrl: Boolean(avatarUrl),
    },
  };
}
