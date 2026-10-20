import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * A stored timestamp must say which zone it is in.
 *
 * SQLite keeps «2026-10-20 11:12:49» — UTC, with nothing saying so — and
 * a browser parses a string in that shape as **local** time. So every
 * stamp in the conversation was quietly short by the viewer's own offset:
 * on 2026-10-20 a message that arrived at 14:12 in Jerusalem read 11:12
 * on Wisam's screen, three hours behind, with no error anywhere.
 */
test("every timestamp that leaves the server names its zone", async () => {
  const { createMember, createMessage, listMessages, getDb } = await import("@/app/lib/db");

  const her = createMember({ name: "ويس", phone: "+972526993229" })!;
  const message = createMessage({ memberId: her.id, direction: "incoming", body: "يا ريت", status: "received" });

  // Exactly what WhatsApp's webhook writes: UTC wall clock, no marker.
  getDb().prepare("UPDATE messages SET created_at = ? WHERE id = ?").run("2026-10-20 11:12:49", message.id);

  const stored = listMessages(her.id).find((m) => m.id === message.id)!;
  assert.equal(stored.createdAt, "2026-10-20T11:12:49Z", "the Z is the whole fix");

  // And it survives the round trip as the instant it actually was, which
  // is what every «منذ دقيقتين» and every clock in the thread reads.
  assert.equal(new Date(stored.createdAt).toISOString(), "2026-10-20T11:12:49.000Z");
  assert.equal(
    new Date(stored.createdAt).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit"
    }),
    "14:12",
    "the hour it really was in the country"
  );

  // A value already in ISO is left exactly as it is.
  const { toIso } = await import("@/app/lib/db");
  assert.equal(toIso("2026-10-20T11:12:49Z"), "2026-10-20T11:12:49Z");
});
