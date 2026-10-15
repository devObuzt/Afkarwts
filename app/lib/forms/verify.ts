import { createHash, randomInt } from "node:crypto";
import { getDb, normalizeImportPhone } from "../db";
import { sendSms } from "../sms";

/**
 * Proving the phone belongs to the woman filling the form.
 *
 * Two women registered twice with a mistyped number, and the table could
 * not tell them from two different women. A code closes that at the door:
 * a number nobody answers never becomes a registration.
 *
 * WhatsApp by default, because the whole cohort is run over WhatsApp — a
 * number that cannot take the code cannot take the programme either, and
 * learning that now is the point. If WhatsApp refuses the send, SMS
 * carries the same code without her having to choose again.
 *
 * ⚠️ The fallback only catches a refusal. WhatsApp accepting a template is
 * not WhatsApp delivering it, and a number with no WhatsApp on it is
 * accepted and then dropped in silence — which is why «ابعثيلي رسالة
 * نصية» stays on the screen as something she can press herself.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** How long a phone must wait between codes, and how many it may have in an hour. */
const RESEND_MS = 60 * 1000;
const PER_HOUR = 5;
/**
 * Every code costs money to send, and the endpoint that sends them is
 * public by necessity — the form is. So there is a ceiling on the whole
 * service too, not only on each number: without it, a script walking
 * through a list of phone numbers spends Afkar's balance a message at a
 * time and never trips the per-phone limit once.
 */
const PER_HOUR_EVERYONE = 120;
/** Wrong guesses allowed before the code is burned. */
const MAX_TRIES = 5;

export type Channel = "whatsapp" | "sms";

const hash = (code: string, phone: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");
const stamp = (at: Date) => at.toISOString().slice(0, 19).replace("T", " ");

/**
 * An Israeli mobile, in the one shape the rest of the system stores — or
 * null. Never throws: this runs on a public form where whatever somebody
 * typed arrives, and «that is not a mobile» is an answer, not a crash.
 */
export function usablePhone(raw: string) {
  let normal = "";
  try {
    normal = normalizeImportPhone(raw);
  } catch {
    return null;
  }
  return /^\+9725\d{8}$/.test(normal) ? normal : null;
}

export async function startVerification(
  formId: number,
  rawPhone: string,
  channel: Channel,
  now = new Date()
): Promise<{ ok: true; channel: Channel } | { ok: false; error: string; retryAfter?: number }> {
  const phone = usablePhone(rawPhone);
  if (!phone) {
    return { ok: false, error: "هذا الرقم ليس رقم موبايل إسرائيلي. اكتبيه هكذا: 05X-XXX-XXXX" };
  }

  const db = getDb();
  const hourAgo = stamp(new Date(now.getTime() - 60 * 60 * 1000));

  // Six digits, never starting with a zero — a leading zero disappears
  // wherever the code is pasted into something that reads it as a number.
  const code = String(randomInt(100000, 1000000));

  /**
   * The row is written *before* the message goes out, inside one
   * transaction that re-reads the counts. Checking and then sending left a
   * gap: two requests arriving together both read «none sent yet» and both
   * paid for a message. Writing first makes the row itself the ticket, and
   * a send that then fails deletes it.
   */
  let ticket = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Counted across every form, not within one: the limit protects a
    // phone and a budget, and both are shared by all the forms there are.
    const mine = (
      db
        .prepare("SELECT COUNT(*) AS n, MAX(sent_at) AS last FROM form_phone_codes WHERE phone = ? AND sent_at > ?")
        .get(phone, hourAgo) as { n: number; last: string | null }
    );
    if (Number(mine.n) >= PER_HOUR) {
      db.exec("ROLLBACK");
      return { ok: false, error: "طلبتِ الكود مرات كثيرة. انتظري ساعة ثم حاولي مجدداً." };
    }
    if (mine.last) {
      const since = now.getTime() - new Date(`${mine.last}Z`).getTime();
      if (since < RESEND_MS) {
        db.exec("ROLLBACK");
        const wait = Math.ceil((RESEND_MS - since) / 1000);
        return { ok: false, error: `انتظري ${wait} ثانية قبل طلب كود جديد.`, retryAfter: wait };
      }
    }

    const everyone = (
      db.prepare("SELECT COUNT(*) AS n FROM form_phone_codes WHERE sent_at > ?").get(hourAgo) as { n: number }
    ).n;
    if (Number(everyone) >= PER_HOUR_EVERYONE) {
      db.exec("ROLLBACK");
      return { ok: false, error: "الخدمة مشغولة الآن. حاولي بعد قليل." };
    }

    // The older codes are expired, not deleted. Deleting them took the
    // history with them, and the history is what the hourly ceiling counts
    // — so the sixth code in a minute went out as happily as the first.
    // Only the newest row is ever read back anyway, so one live code holds.
    db.prepare(
      `UPDATE form_phone_codes SET expires_at = ?
        WHERE form_id = ? AND phone = ? AND verified_at IS NULL AND expires_at > ?`
    ).run(stamp(now), formId, phone, stamp(now));

    const written = db
      .prepare(
        `INSERT INTO form_phone_codes (form_id, phone, code_hash, channel, sent_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(formId, phone, hash(code, phone), channel, stamp(now), stamp(new Date(now.getTime() + CODE_TTL_MS)));
    ticket = Number(written.lastInsertRowid);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const drop = () => db.prepare("DELETE FROM form_phone_codes WHERE id = ?").run(ticket);

  const text = `${code} هو كود التحقق لتسجيلك في أفكار. صالح ١٠ دقائق.`;
  let carried: Channel = channel;

  try {
    if (channel === "sms") {
      await sendSms(phone, text);
    } else {
      await sendLoginCode(phone, code);
    }
  } catch (whatsappFailed) {
    if (channel === "sms") {
      drop();
      return { ok: false, error: "تعذّر إرسال الرسالة النصية. جرّبي واتساب." };
    }
    // WhatsApp refused it — drop to SMS rather than making her choose
    // again. The one code is the same either way, so whichever message
    // arrives first works.
    try {
      await sendSms(phone, text);
      carried = "sms";
    } catch (smsFailed) {
      drop();
      return { ok: false, error: "تعذّر إرسال الكود على واتساب ولا برسالة نصية. تأكّدي من الرقم." };
    }
  }

  // The row the send was reserved against now records which way it went.
  db.prepare("UPDATE form_phone_codes SET channel = ? WHERE id = ?").run(carried, ticket);

  // What actually carried it, not what was asked for — the screen says
  // «راجعي واتساب» or «راجعي رسائلك» and it has to be the true one.
  return { ok: true, channel: carried };
}

export function checkCode(formId: number, rawPhone: string, code: string, now = new Date()) {
  const phone = usablePhone(rawPhone);
  if (!phone) {
    return { ok: false as const, error: "رقم غير صالح." };
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, code_hash, expires_at, tries FROM form_phone_codes
        WHERE form_id = ? AND phone = ? AND verified_at IS NULL
        ORDER BY id DESC LIMIT 1`
    )
    .get(formId, phone) as { id: number; code_hash: string; expires_at: string; tries: number } | undefined;

  if (!row) {
    return { ok: false as const, error: "اطلبي كوداً أولاً." };
  }
  if (new Date(`${row.expires_at}Z`).getTime() < now.getTime()) {
    return { ok: false as const, error: "انتهت صلاحية الكود. اطلبي كوداً جديداً." };
  }
  if (row.tries >= MAX_TRIES) {
    return { ok: false as const, error: "حاولتِ مرات كثيرة. اطلبي كوداً جديداً." };
  }

  const typed = String(code ?? "").replace(/\D/g, "");
  if (hash(typed, phone) !== row.code_hash) {
    db.prepare("UPDATE form_phone_codes SET tries = tries + 1 WHERE id = ?").run(row.id);
    const left = MAX_TRIES - row.tries - 1;
    return {
      ok: false as const,
      error: left > 0 ? `الكود غير صحيح. بقيت ${left === 1 ? "محاولة واحدة" : `${left} محاولات`}.` : "الكود غير صحيح."
    };
  }

  db.prepare("UPDATE form_phone_codes SET verified_at = ? WHERE id = ?").run(stamp(now), row.id);
  return { ok: true as const };
}

/**
 * Whether this phone proved itself on this form recently enough to submit.
 *
 * Checked again on the server at submit time, never only in the browser:
 * the form posts to a public endpoint, and a check that lives in the page
 * is a check anybody can skip.
 */
export function phoneIsVerified(formId: number, rawPhone: string, now = new Date()) {
  const phone = usablePhone(rawPhone);
  if (!phone) {
    return false;
  }
  const row = getDb()
    .prepare(
      `SELECT verified_at FROM form_phone_codes
        WHERE form_id = ? AND phone = ? AND verified_at IS NOT NULL
        ORDER BY id DESC LIMIT 1`
    )
    .get(formId, phone) as { verified_at: string } | undefined;
  if (!row) {
    return false;
  }
  // The proof lasts the length of one sitting, not for ever.
  return now.getTime() - new Date(`${row.verified_at}Z`).getTime() < 2 * 60 * 60 * 1000;
}

/**
 * Afkar's approved AUTHENTICATION template. It carries a «copy the code»
 * button, and Meta wants the code in the button's parameters as well as
 * the body — the button is a URL whose query string holds it.
 */
async function sendLoginCode(phone: string, code: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || "v19.0";
  if (!token || !phoneId) {
    throw new Error("WhatsApp is not configured.");
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_LOGIN_TEMPLATE || "afkar_app_login",
        language: { code: "ar" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }
        ]
      }
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message ?? `WhatsApp refused the code (${response.status}).`);
  }
}
