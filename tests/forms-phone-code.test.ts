import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// No credentials: sendSms returns a dry-run id and the WhatsApp path
// throws, which is exactly the fallback this needs to exercise.
process.env.SMS_PROVIDER = "none";
delete process.env.WHATSAPP_ACCESS_TOKEN;

let seq = 0;

async function form() {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`كلين كود ${seq}`);
  return createForm({ name: `كلين كود ${seq}`, groupId: group.id, fromTemplate: true });
}

/** The one code that was stored, read straight from the row. */
async function codeFor(formId: number, phone: string) {
  const { getDb } = await import("@/app/lib/db");
  const row = getDb()
    .prepare("SELECT code_hash FROM form_phone_codes WHERE form_id = ? ORDER BY id DESC LIMIT 1")
    .get(formId) as { code_hash: string };
  const { createHash } = await import("node:crypto");
  // Brute-forcing six digits is the only way in from outside, which is
  // the point: the code is stored hashed, not readable.
  for (let guess = 100000; guess < 1000000; guess++) {
    if (createHash("sha256").update(`${phone}:${guess}`).digest("hex") === row.code_hash) {
      return String(guess);
    }
  }
  throw new Error("no code matched");
}

test("a registration without a confirmed number is refused by the server", async () => {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const made = await form();

  const answers: Record<string, string> = {};
  for (const field of listFields(made.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? "سارة عوض"
        : field.mapsTo === "phone"
          ? "0545227690"
          : field.mapsTo === "city"
            ? "مجد الكروم"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }

  // The browser is not the gate: this posts straight at the function the
  // public endpoint calls.
  const refused = submitForm(made.token, answers);
  assert.equal(refused.ok, false);
  assert.match((refused as { error: string }).error, /أكّدي رقم هاتفك/);
});

test("the code sent is the code accepted, once, and only for that number", async () => {
  const { startVerification, checkCode, phoneIsVerified } = await import("@/app/lib/forms/verify");
  const made = await form();

  const started = await startVerification(made.id, "0545227691", "sms");
  assert.equal(started.ok, true);

  const code = await codeFor(made.id, "+972545227691");
  assert.equal(checkCode(made.id, "0545227691", "000000").ok, false, "a wrong code is refused");
  assert.equal(checkCode(made.id, "0545227692", code).ok, false, "and the right code on another number too");
  assert.equal(checkCode(made.id, "0545227691", code).ok, true);
  assert.equal(phoneIsVerified(made.id, "0545227691"), true);
  assert.equal(phoneIsVerified(made.id, "0545227692"), false, "nobody else is let through by it");
});

test("five wrong guesses burn the code", async () => {
  const { startVerification, checkCode } = await import("@/app/lib/forms/verify");
  const made = await form();
  await startVerification(made.id, "0545227693", "sms");
  const code = await codeFor(made.id, "+972545227693");

  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(checkCode(made.id, "0545227693", "000000").ok, false);
  }
  // Even the right one, now.
  const after = checkCode(made.id, "0545227693", code);
  assert.equal(after.ok, false);
  assert.match((after as { error: string }).error, /اطلبي كوداً جديداً/);
});

test("an expired code is refused", async () => {
  const { startVerification, checkCode, CODE_TTL_MS } = await import("@/app/lib/forms/verify");
  const made = await form();
  const now = new Date("2026-10-15T10:00:00.000Z");
  await startVerification(made.id, "0545227694", "sms", now);
  const code = await codeFor(made.id, "+972545227694");

  const late = new Date(now.getTime() + CODE_TTL_MS + 1000);
  const result = checkCode(made.id, "0545227694", code, late);
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /انتهت صلاحية/);
});

test("WhatsApp refusing the send drops to SMS with the same code", async () => {
  const { startVerification, checkCode } = await import("@/app/lib/forms/verify");
  const made = await form();

  // WHATSAPP_ACCESS_TOKEN is unset, so the WhatsApp path throws.
  const started = await startVerification(made.id, "0545227695", "whatsapp");
  assert.equal(started.ok, true);
  assert.equal((started as { channel: string }).channel, "sms", "and it says which one actually carried it");

  const code = await codeFor(made.id, "+972545227695");
  assert.equal(checkCode(made.id, "0545227695", code).ok, true);
});

test("a number that is not an Israeli mobile is turned away before anything is sent", async () => {
  const { startVerification } = await import("@/app/lib/forms/verify");
  const made = await form();
  for (const bad of ["0208254566", "45446232", "0312345678"]) {
    const result = await startVerification(made.id, bad, "sms");
    assert.equal(result.ok, false, `«${bad}» should not be accepted`);
  }
});

test("asking again too soon is refused, and too often in an hour", async () => {
  const { startVerification } = await import("@/app/lib/forms/verify");
  const made = await form();
  const now = new Date("2026-10-15T10:00:00.000Z");

  assert.equal((await startVerification(made.id, "0545227696", "sms", now)).ok, true);
  const again = await startVerification(made.id, "0545227696", "sms", new Date(now.getTime() + 5000));
  assert.equal(again.ok, false, "five seconds later is too soon");

  let at = now;
  for (let sent = 1; sent < 5; sent++) {
    at = new Date(at.getTime() + 2 * 60 * 1000);
    assert.equal((await startVerification(made.id, "0545227696", "sms", at)).ok, true, `send ${sent + 1}`);
  }
  const sixth = await startVerification(made.id, "0545227696", "sms", new Date(at.getTime() + 2 * 60 * 1000));
  assert.equal(sixth.ok, false, "the sixth in an hour is refused");
});

test("a confirmed number lets the registration through", async () => {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const { startVerification, checkCode } = await import("@/app/lib/forms/verify");
  const made = await form();

  await startVerification(made.id, "0545227697", "sms");
  const code = await codeFor(made.id, "+972545227697");
  assert.equal(checkCode(made.id, "0545227697", code).ok, true);

  const answers: Record<string, string> = {};
  for (const field of listFields(made.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? "سارة عوض"
        : field.mapsTo === "phone"
          ? "0545227697"
          : field.mapsTo === "city"
            ? "مجد الكروم"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }
  assert.equal(submitForm(made.token, answers).ok, true);
});

test("a fresh code is not already expired", async () => {
  const { startVerification, CODE_TTL_MS } = await import("@/app/lib/forms/verify");
  const { getDb } = await import("@/app/lib/db");
  const made = await form();

  // A stray «expire the old ones» statement once ran *after* the insert
  // and burned the new row on its way out: every code was born dead, and
  // the only symptom was «انتهت صلاحية الكود» on the first try.
  const now = new Date("2026-10-15T10:00:00.000Z");
  await startVerification(made.id, "0545227698", "sms", now);

  const row = getDb()
    .prepare("SELECT sent_at, expires_at FROM form_phone_codes WHERE form_id = ? ORDER BY id DESC LIMIT 1")
    .get(made.id) as { sent_at: string; expires_at: string };
  const life = new Date(`${row.expires_at}Z`).getTime() - new Date(`${row.sent_at}Z`).getTime();
  assert.equal(life, CODE_TTL_MS, "it lives exactly its ten minutes");
});

test("the whole service has a ceiling, not only each number", async () => {
  const { startVerification } = await import("@/app/lib/forms/verify");
  const { getDb } = await import("@/app/lib/db");
  const made = await form();
  const now = new Date("2026-11-01T10:00:00.000Z");

  // The endpoint is public because the form is, and every code costs
  // money. A script walking a list of numbers never trips the per-phone
  // limit once, so there is a budget for everyone together.
  const stamp = (at: Date) => at.toISOString().slice(0, 19).replace("T", " ");
  const insert = getDb().prepare(
    `INSERT INTO form_phone_codes (form_id, phone, code_hash, channel, sent_at, expires_at)
     VALUES (?, ?, 'x', 'sms', ?, ?)`
  );
  for (let at = 0; at < 120; at++) {
    insert.run(made.id, `+97253${String(1000000 + at)}`, stamp(now), stamp(new Date(now.getTime() + 60000)));
  }

  const blocked = await startVerification(made.id, "0545227699", "sms", new Date(now.getTime() + 1000));
  assert.equal(blocked.ok, false, "a fresh number is refused once the hour's budget is gone");
  assert.match((blocked as { error: string }).error, /مشغولة/);
});
