import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "a-secret-the-edge-can-sign-with";

test("a session cookie proves who it belongs to without a database", async () => {
  const { signSession, readSession } = await import("@/app/lib/users/session");

  const token = await signSession(42);
  assert.equal((await readSession(token))?.userId, 42);
});

test("a forged or edited cookie is refused", async () => {
  const { signSession, readSession } = await import("@/app/lib/users/session");

  const token = await signSession(42);
  const [body, signature] = token.split(".");

  assert.equal(await readSession(undefined), null);
  assert.equal(await readSession("nonsense"), null);
  assert.equal(await readSession(body), null, "a payload with no signature");
  assert.equal(await readSession(`${body}.${"A".repeat(signature.length)}`), null, "a wrong signature");

  // The whole point: swapping the user id has to invalidate the signature,
  // or anyone could sign in as anyone by editing a cookie.
  const forged = Buffer.from(JSON.stringify({ userId: 1, issuedAt: Date.now() })).toString("base64url");
  assert.equal(await readSession(`${forged}.${signature}`), null);
});

test("a session signed with another secret is refused", async () => {
  const { signSession } = await import("@/app/lib/users/session");
  const token = await signSession(7);

  process.env.SESSION_SECRET = "a-different-secret";
  // The module caches nothing, so the next read uses the new secret.
  const fresh = await import(`@/app/lib/users/session?x=${Date.now()}`);
  assert.equal(await fresh.readSession(token), null);
  process.env.SESSION_SECRET = "a-secret-the-edge-can-sign-with";
});

test("an old session stops being accepted", async () => {
  const { readSession, SESSION_DAYS } = await import("@/app/lib/users/session");
  const { createHmac } = await import("node:crypto");

  const stale = Date.now() - (SESSION_DAYS + 1) * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ userId: 9, issuedAt: stale })).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");

  assert.equal(await readSession(`${body}.${signature}`), null, "signed, but expired");
});
