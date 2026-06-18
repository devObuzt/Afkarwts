export const AUTH_COOKIE = "afkar_admin_session";

export function getAdminConfig() {
  return {
    username: process.env.Admin_User || process.env.ADMIN_USER || "",
    password: process.env.Admin_Pass || process.env.ADMIN_PASS || ""
  };
}

export function isAuthConfigured() {
  const config = getAdminConfig();
  return Boolean(config.username && config.password);
}

export async function createSessionToken() {
  const config = getAdminConfig();
  const source = `afkar-admin:${config.username}:${config.password}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidSessionToken(token?: string) {
  if (!token || !isAuthConfigured()) {
    return false;
  }

  return token === (await createSessionToken());
}
