import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();
process.env.Admin_User = "afkar";
process.env.Admin_Pass = "the-old-shared-one";

let seq = 0;
function name() {
  seq += 1;
  return `user${seq}`;
}

test("a password is stored salted and never in the clear", async () => {
  const { createUser, authenticate } = await import("@/app/lib/users/store");
  const { getDb } = await import("@/app/lib/db");

  const username = name();
  const created = createUser({ name: "مريم", username, password: "correct-horse", role: "assistant" });
  assert.equal(created.ok, true);

  const row = getDb().prepare("SELECT password_hash FROM users WHERE username = ?").get(username) as {
    password_hash: string;
  };
  assert.ok(!row.password_hash.includes("correct-horse"), "the password itself is not in the row");
  assert.ok(row.password_hash.includes(":"), "salt and hash");

  assert.equal(authenticate(username, "correct-horse")?.username, username);
  assert.equal(authenticate(username, "wrong"), null);
  assert.equal(authenticate(username.toUpperCase(), "correct-horse")?.username, username, "case does not matter");
});

test("two users with the same password do not share a hash", async () => {
  const { createUser } = await import("@/app/lib/users/store");
  const { getDb } = await import("@/app/lib/db");

  const a = name();
  const b = name();
  createUser({ name: "أ", username: a, password: "same-password", role: "assistant" });
  createUser({ name: "ب", username: b, password: "same-password", role: "assistant" });

  const hashes = (getDb().prepare("SELECT password_hash FROM users WHERE username IN (?, ?)").all(a, b) as Array<{
    password_hash: string;
  }>).map((row) => row.password_hash);

  assert.notEqual(hashes[0], hashes[1], "a shared salt would let one crack answer for both");
});

test("a switched-off account fails the way a wrong password does", async () => {
  const { createUser, authenticate, updateUser } = await import("@/app/lib/users/store");

  const username = name();
  const created = createUser({ name: "خرجت", username, password: "still-knows-it", role: "assistant" });
  assert.equal(created.ok, true);

  updateUser(created.ok ? created.user.id : 0, { active: false });
  assert.equal(authenticate(username, "still-knows-it"), null, "the login screen never says who exists here");
});

test("the owner keeps every permission, whatever the row says", async () => {
  const { createUser, updateUser } = await import("@/app/lib/users/store");
  const { PERMISSIONS } = await import("@/app/lib/users/permissions");

  const created = createUser({ name: "أفكار", username: name(), password: "owner-pass-1", role: "owner" });
  assert.equal(created.ok, true);
  const id = created.ok ? created.user.id : 0;

  // A mis-click on the users screen must not lock the owner out of the
  // screen that would undo it.
  const after = updateUser(id, { permissions: [] });
  assert.equal(after.ok, true);
  assert.equal(after.ok ? after.user.permissions.length : 0, PERMISSIONS.length);
});

test("the last active owner cannot be switched off or demoted", async () => {
  const { useTempDataDir: _ } = await import("./helpers/data-dir.ts");
  const { createUser, updateUser, listUsers, countActiveOwners } = await import("@/app/lib/users/store");
  const { getDb } = await import("@/app/lib/db");

  getDb().exec("DELETE FROM users");
  const only = createUser({ name: "أفكار", username: name(), password: "owner-pass-2", role: "owner" });
  const id = only.ok ? only.user.id : 0;

  assert.equal(countActiveOwners(), 1);
  assert.equal(updateUser(id, { active: false }).ok, false, "nobody would be left to put it back");
  assert.equal(updateUser(id, { role: "assistant" }).ok, false);

  const second = createUser({ name: "تانية", username: name(), password: "owner-pass-3", role: "owner" });
  assert.equal(second.ok, true);
  assert.equal(updateUser(id, { active: false }).ok, true, "with a second owner it is allowed");
  assert.equal(listUsers().filter((user) => user.active).length >= 1, true);
});

test("a role is a starting point, and every permission is a checkbox after it", async () => {
  const { createUser, updateUser } = await import("@/app/lib/users/store");
  const { ROLE_PRESET } = await import("@/app/lib/users/permissions");

  const created = createUser({ name: "مساعِدة", username: name(), password: "assistant-pw", role: "assistant" });
  const user = created.ok ? created.user : null;
  assert.deepEqual(user?.permissions, ROLE_PRESET.assistant);
  assert.ok(!user?.permissions.includes("people.health"), "an assistant does not read illnesses by default");

  const granted = updateUser(user!.id, { permissions: [...ROLE_PRESET.assistant, "people.health"] });
  assert.ok(granted.ok && granted.user.permissions.includes("people.health"), "but it can be handed to her by name");
});

test("the shared login becomes the first owner, once", async () => {
  const { bootstrapOwner } = await import("@/app/lib/users/bootstrap");
  const { getDb } = await import("@/app/lib/db");

  getDb().exec("DELETE FROM users");

  assert.equal(bootstrapOwner("afkar", "wrong"), null, "only the real shared credentials");
  const owner = bootstrapOwner("afkar", "the-old-shared-one");
  assert.equal(owner?.role, "owner");
  assert.equal(owner?.mustChangePassword, true, "the first thing asked for is a password of her own");

  assert.equal(bootstrapOwner("afkar", "the-old-shared-one"), null, "and never again once a user exists");
});

test("a nonsense username is refused before it reaches the database", async () => {
  const { createUser } = await import("@/app/lib/users/store");

  assert.equal(createUser({ name: "x", username: "ما في", password: "longenough", role: "assistant" }).ok, false);
  assert.equal(createUser({ name: "x", username: "ab", password: "longenough", role: "assistant" }).ok, false);
  assert.equal(createUser({ name: "x", username: name(), password: "short", role: "assistant" }).ok, false);
});

test("a user created with no list named gets the role's preset, not nothing", async () => {
  const { createUser } = await import("@/app/lib/users/store");
  const { ROLE_PRESET } = await import("@/app/lib/users/permissions");

  // The API sends no permissions when the role's own preset is wanted. An
  // empty array is a different statement: someone who may do nothing.
  const preset = createUser({ name: "بلا قائمة", username: name(), password: "preset-pass", role: "assistant" });
  assert.deepEqual(preset.ok ? preset.user.permissions : null, ROLE_PRESET.assistant);

  const none = createUser({ name: "بلا شي", username: name(), password: "none-pass-1", role: "assistant", permissions: [] });
  assert.deepEqual(none.ok ? none.user.permissions : null, []);
});
