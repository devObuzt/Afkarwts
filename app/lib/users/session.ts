/**
 * The session cookie.
 *
 * The middleware runs on the edge runtime and cannot open SQLite, so the
 * cookie has to prove who it belongs to on its own: a signed statement of
 * the user id, checked with Web Crypto, which the edge does have.
 *
 * The signature is all the middleware checks. Whether that user still
 * exists, is still active, and still holds the permission being used is
 * read from the database by `requireUser` on the page or route itself —
 * which is where it has to be anyway, because a cookie cannot know that an
 * account was switched off a minute ago.
 */

export const SESSION_COOKIE = "afkar_session";
export const SESSION_DAYS = 14;

type Payload = { userId: number; issuedAt: number };

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

/**
 * The key the cookie is signed with. SESSION_SECRET when it is set;
 * otherwise the admin password, which every deployment already has — so a
 * missing variable cannot silently turn signing into a no-op.
 */
function secretSource() {
  const secret = process.env.SESSION_SECRET || process.env.Admin_Pass || process.env.ADMIN_PASS || "";
  if (!secret) {
    throw new Error("No session secret: set SESSION_SECRET.");
  }
  return secret;
}

async function key() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretSource()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(userId: number) {
  const payload: Payload = { userId, issuedAt: Date.now() };
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

/** The user id the cookie claims, or null when it does not hold up. */
export async function readSession(token: string | undefined) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, signature] = token.split(".");

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromBase64url(signature),
      new TextEncoder().encode(body)
    );
  } catch {
    return null;
  }

  if (!valid) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Payload;
    if (!Number.isInteger(payload.userId)) {
      return null;
    }
    if (Date.now() - payload.issuedAt > SESSION_DAYS * 24 * 60 * 60 * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
