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

test("without people.all the app list shows only the people assigned to you — same rule as /new/people", async () => {
  const { useTempDataDir } = await import("./helpers/data-dir.ts");
  useTempDataDir();
  const { createMember, getDb } = await import("@/app/lib/db");
  const { createUser } = await import("@/app/lib/users/store");
  const { visibleAppMembers } = await import("@/app/lib/afkar-app/person");

  const coach = createUser({ name: "مدرّبة", username: `c${Date.now()}`, password: "p".repeat(12), role: "coach", mustChangePassword: false });
  assert.ok(coach.ok);
  const mine = createMember({ name: "لي", phone: "+972500000011" })!;
  const other = createMember({ name: "لغيري", phone: "+972500000012" })!;
  getDb().prepare("UPDATE members SET assigned_user_id = ? WHERE id = ?").run(coach.user.id, mine.id);

  const app = [
    { id: "a", display_name: "لي", phone_e164: null, first_login_at: null, afkarwts_person_id: String(mine.id) },
    { id: "b", display_name: "لغيري", phone_e164: null, first_login_at: null, afkarwts_person_id: String(other.id) },
    { id: "c", display_name: "بلا ربط", phone_e164: null, first_login_at: null, afkarwts_person_id: null }
  ];

  assert.deepEqual(visibleAppMembers(app, { id: coach.user.id, seesAll: false }).map((m) => m.id), ["a"]);
  assert.deepEqual(visibleAppMembers(app, { id: coach.user.id, seesAll: true }).map((m) => m.id), ["a", "b", "c"]);
});

test("acting on someone's app account needs people.all or her being assigned to you", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { createUser } = await import("@/app/lib/users/store");
  const { canActOnPerson } = await import("@/app/lib/afkar-app/person");

  const helper = createUser({ name: "مساعدة", username: `h${Date.now()}`, password: "p".repeat(12), role: "coach", mustChangePassword: false });
  assert.ok(helper.ok);
  const mine = createMember({ name: "لي", phone: "+972500000021" })!;
  const other = createMember({ name: "لغيري", phone: "+972500000022" })!;
  getDb().prepare("UPDATE members SET assigned_user_id = ? WHERE id = ?").run(helper.user.id, mine.id);

  const limited = { ...helper.user, permissions: ["people.view", "people.edit"] };
  assert.equal(canActOnPerson(limited, mine.id), true);
  assert.equal(canActOnPerson(limited, other.id), false, "a login link for someone else's member is her account, not a profile view");
  assert.equal(canActOnPerson({ ...limited, permissions: [...limited.permissions, "people.all"] }, other.id), true);
  assert.equal(canActOnPerson({ ...limited, role: "owner", permissions: [] }, other.id), true, "the owner is never short");
});

test("a coach change on her page tells the app, so the new coach sees her and the old one doesn't", async () => {
  const { coachChangedEvent } = await import("@/app/lib/afkar-app/client");
  const set = coachChangedEvent(7, 12);
  assert.equal(set.type, "person.updated");
  assert.deepEqual(set.data, { person_id: "7", coach_user_id: "12" });
  assert.ok(set.event_id && set.occurred_at);
  assert.deepEqual(coachChangedEvent(7, null).data, { person_id: "7", coach_user_id: null }, "removed means removed, not left as it was");
  assert.notEqual(coachChangedEvent(7, 12).event_id, set.event_id, "the app ignores an event_id it has seen");
});

test("who may change a coach: only whoever sees everyone, and only to a live account", async () => {
  const { useTempDataDir } = await import("./helpers/data-dir.ts");
  useTempDataDir();
  const { createUser, setUserActive } = await import("@/app/lib/users/store") as any;
  const { coachChangeRefusal } = await import("@/app/lib/afkar-app/person");
  const stamp = Date.now();
  const coach = createUser({ name: "م", username: `cc${stamp}`, password: "p".repeat(12), role: "coach", mustChangePassword: false });
  const owner = createUser({ name: "و", username: `oo${stamp}`, password: "p".repeat(12), role: "owner", mustChangePassword: false });
  assert.ok(coach.ok && owner.ok);
  assert.equal(coachChangeRefusal(coach.user, coach.user.id), "FORBIDDEN", "a coach can't give herself someone's file");
  assert.equal(coachChangeRefusal(coach.user, null), "FORBIDDEN", "nor take a colleague off it");
  assert.equal(coachChangeRefusal(owner.user, coach.user.id), null);
  assert.equal(coachChangeRefusal(owner.user, null), null);
  assert.equal(coachChangeRefusal(owner.user, 999999), "BAD_COACH");
  assert.equal(coachChangeRefusal(owner.user, Number.NaN), "BAD_COACH");
});

test("a coach change is retried when the app is down, under one event id", async () => {
  const { deliverAppEvent } = await import("@/app/lib/afkar-app/client");
  process.env.AFKAR_APP_URL = "https://api.example"; process.env.AFKAR_APP_SERVICE_KEY = "k";
  process.env.AFKAR_APP_STAFF_SECRET = "s"; process.env.AFKAR_APP_EVENTS_SECRET = "e";
  const original = globalThis.fetch;
  const ids: string[] = [];
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    ids.push(JSON.parse(String(init.body)).event_id);
    if (ids.length < 3) throw new Error("down");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await deliverAppEvent({ event_id: "same" }, { waits: [0, 0] }), true);
    assert.deepEqual(ids, ["same", "same", "same"]);
    ids.length = 0;
    globalThis.fetch = (async () => { ids.push("x"); throw new Error("down"); }) as typeof fetch;
    assert.equal(await deliverAppEvent({ event_id: "gone" }, { waits: [0] }), false);
    assert.equal(ids.length, 2);
  } finally { globalThis.fetch = original; }
});
