import { createHmac, timingSafeEqual } from "node:crypto";

export const PUBLIC_AUTH_SESSION_COOKIE = "nzu_public_session";

export type PublicAuthProvider = "soop" | "supabase";

export type PublicAuthStatus = "planned" | "ready";

export type PublicAuthPlan = {
  status: PublicAuthStatus;
  primaryProvider: PublicAuthProvider;
  fallbackProvider: PublicAuthProvider;
  loginLabel: string;
  note: string;
};

export type PublicAuthSession = {
  provider: PublicAuthProvider;
  providerUserId: string;
  displayName: string;
  avatarUrl?: string | null;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  return String(process.env.PUBLIC_AUTH_SESSION_SECRET || "").trim();
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

export function getPublicAuthPlan(): PublicAuthPlan {
  return {
    status: "planned",
    primaryProvider: "soop",
    fallbackProvider: "supabase",
    loginLabel: "LOGIN",
    note: "공개 로그인 연동은 준비 중이며 현재 게시판 MVP는 임시 작성자명 기반으로 동작합니다.",
  };
}

export function isPublicAuthReady() {
  return getPublicAuthPlan().status === "ready";
}

export function isPublicAuthSessionConfigured() {
  return Boolean(getSessionSecret());
}

export function createPublicAuthSessionCookieValue(session: PublicAuthSession) {
  const encodedPayload = encodeBase64Url(JSON.stringify(session));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parsePublicAuthSessionCookieValue(value: string | undefined | null) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const raw = String(value || "").trim();
  if (!raw || !raw.includes(".")) return null;

  const [encodedPayload, providedSignature] = raw.split(".", 2);
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const left = Buffer.from(providedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length) return null;
  if (!timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<PublicAuthSession>;
    if (!parsed.provider || !parsed.providerUserId || !parsed.displayName) return null;
    return {
      provider: parsed.provider,
      providerUserId: parsed.providerUserId,
      displayName: parsed.displayName,
      avatarUrl: parsed.avatarUrl || null,
    } satisfies PublicAuthSession;
  } catch {
    return null;
  }
}
