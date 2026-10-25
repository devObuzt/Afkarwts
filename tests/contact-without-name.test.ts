import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * The number is required; the name is not (Wisam, 2026-10-25).
 *
 * A contact arrives as a number far more often than as a name — from an
 * ad, a forwarded message, a list someone read out — and refusing to
 * store her until somebody types a name is how numbers end up in a
 * notebook instead of here.
 */
test("a contact can be saved with a number alone", async () => {
  const { createMember, displayName, getMember } = await import("@/app/lib/db");
  const { contactFirstName } = await import("@/app/lib/whatsapp");

  const nameless = createMember({ name: "", phone: "+972526800301" })!;
  assert.equal(nameless.name, "");
  assert.equal(nameless.phone, "+972526800301");

  // On screen she is her number, never a blank row.
  assert.equal(displayName(nameless), "+972526800301");
  assert.equal(displayName({ name: "  ", phone: "+972526800301" }), "+972526800301");
  assert.equal(displayName({ name: "رنا", phone: "+972526800301" }), "رنا");

  // And a message to her is addressed the neutral way, not to an empty
  // space — the greeting token must never render as nothing.
  const greeting = contactFirstName(nameless);
  assert.ok(greeting.trim().length > 0, "a nameless contact still gets a greeting");

  // The number is still the one thing she cannot be saved without.
  assert.throws(() => createMember({ name: "بلا رقم", phone: "" }));
  assert.throws(() => createMember({ name: "رقم قصير", phone: "123" }));

  // And she is a real row that can be read back and named later.
  assert.equal(getMember(nameless.id)!.phone, "+972526800301");
});
