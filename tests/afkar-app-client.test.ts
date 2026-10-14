import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SECRET = "s".repeat(40);

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

test("the staff assertion is an HS256 token the app can verify", async () => {
  const { staffAssertion } = await import("@/app/lib/afkar-app/client");
  const now = new Date("2026-10-14T10:00:00Z");
  const token = staffAssertion({ id: 7, name: "أفكار", role: "owner" }, SECRET, now);
  const [head, body, sig] = token.split(".");

  assert.deepEqual(decode(head), { alg: "HS256", typ: "JWT" });
  const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  assert.equal(sig, expected, "signed over header.payload with the shared secret");

  const claims = decode(body);
  assert.equal(claims.iss, "afkarwts");
  assert.equal(claims.aud, "afkar-app");
  assert.equal(claims.sub, "7", "the HeartBeat user id, as a string");
  assert.equal(claims.name, "أفكار");
  assert.equal(claims.role, "owner");
  assert.equal(claims.iat, now.getTime() / 1000);
  assert.ok(claims.exp - claims.iat <= 300, "short-lived — the app refuses anything older than 5 minutes");
  assert.equal("partner_slug" in claims, false, "absent = Afkar herself");
});

test("HeartBeat roles map onto the app's three", async () => {
  const { appRoleOf } = await import("@/app/lib/afkar-app/client");
  assert.equal(appRoleOf("owner"), "owner");
  assert.equal(appRoleOf("assistant"), "staff");
  assert.equal(appRoleOf("developer"), "staff");
  assert.equal(appRoleOf("coach"), "coach");
  assert.equal(appRoleOf("anything-else"), "coach", "an unknown role gets the narrowest access, not the widest");
});

test("an event is signed over timestamp.body", async () => {
  const { signEvent } = await import("@/app/lib/afkar-app/client");
  const body = JSON.stringify({ a: 1 });
  const expected = `sha256=${createHmac("sha256", SECRET).update(`1760000000.${body}`).digest("hex")}`;
  assert.equal(signEvent(body, "1760000000", SECRET), expected);
});

test("an enrollment event carries what the app needs to build her plan", async () => {
  const { enrollmentEvent } = await import("@/app/lib/afkar-app/client");
  const now = new Date("2026-10-14T10:00:00Z");
  const event = enrollmentEvent(
    { id: 42, name: "ريم", phone: "+972500000001" },
    { programKey: "clean-week", startsOn: "2026-10-15", coachUserId: 3 },
    now
  );

  assert.equal(event.type, "enrollment.created");
  assert.match(event.event_id, /^[0-9a-f-]{36}$/);
  assert.equal(event.occurred_at, "2026-10-14T10:00:00.000Z");
  assert.deepEqual(event.data, {
    person_id: "42",
    display_name: "ريم",
    phone: "+972500000001",
    program_key: "clean-week",
    starts_on: "2026-10-15",
    coach_user_id: "3"
  });

  const noCoach = enrollmentEvent({ id: 1, name: "س", phone: "" }, { programKey: "x", startsOn: "2026-10-15", coachUserId: null }, now);
  assert.equal(noCoach.data.phone, null, "no phone is null, not an empty string the app would reject");
  assert.equal(noCoach.data.coach_user_id, null);
});

test("without the four settings the integration reports itself off instead of calling out", async () => {
  const { appConfig } = await import("@/app/lib/afkar-app/client");
  for (const key of ["AFKAR_APP_URL", "AFKAR_APP_SERVICE_KEY", "AFKAR_APP_STAFF_SECRET", "AFKAR_APP_EVENTS_SECRET"]) {
    delete process.env[key];
  }
  assert.equal(appConfig(), null);

  process.env.AFKAR_APP_URL = "https://api.example/";
  process.env.AFKAR_APP_SERVICE_KEY = "k";
  process.env.AFKAR_APP_STAFF_SECRET = "s";
  assert.equal(appConfig(), null, "three of four is still off");

  process.env.AFKAR_APP_EVENTS_SECRET = "e";
  assert.deepEqual(appConfig(), { url: "https://api.example", serviceKey: "k", staffSecret: "s", eventsSecret: "e" });
});

test("names from the app arrive per language and are shown in Arabic", async () => {
  const { localName } = await import("@/app/lib/afkar-app/person");
  assert.equal(localName({ ar: "Clean Week (تجريبي)", he: "שבוע נקי" }), "Clean Week (تجريبي)");
  assert.equal(localName({ he: "שבוע נקי" }), "שבוע נקי", "Arabic missing — any name beats none");
  assert.equal(localName("نص"), "نص");
  assert.equal(localName(null), "");
});
