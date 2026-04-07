export const ADMIN_SESSION_COOKIE = "nzu_admin_session";

export function adminAccessKey() {
  return String(process.env.ADMIN_ACCESS_KEY || "").trim();
}

export function isAdminConfigured() {
  return Boolean(adminAccessKey());
}

export function isValidAdminSession(value: string | undefined | null) {
  const key = adminAccessKey();
  if (!key) return false;
  return String(value || "") === key;
}

export function assertValidAdminSession(value: string | undefined | null) {
  if (!isValidAdminSession(value)) {
    throw new Error("unauthorized");
  }
}
