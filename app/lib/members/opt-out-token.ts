import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * التوكن اللي بيحمله رابط «إيقاف الرسائل» بكل رسالة تسويق.
 *
 * ليش توكن ومش الرقم مكشوف بالرابط: لإنه الرابط عام، وبلا بصمة أي حد
 * بيقدر يكتب `/stop/972501234567` ويوقف رسائل حدا تاني. التوكن فيه
 * الرقم **وبصمة** عليه، فما بينفع يتولّد إلا من عندنا.
 *
 * وليش محسوب (HMAC) ومش مخزّن بجدول: ما بدّه صف لكل رسالة بتنبعت —
 * والإرسالات بالعشرات الآلاف — ولا بدّه تنظيف. نفس الرقم بيعطي نفس
 * التوكن دايماً، فالرابط القديم بيضل شغّال.
 *
 * ⚠️ التوكن مربوط بالسرّ: لو تغيّر `OPT_OUT_SECRET` بتموت كل الروابط
 * اللي وصلت للناس قبله. تغييره = كسر طريق الخروج القانوني، فما بينغيّر
 * إلا باختيار واعي.
 */

const SIGNATURE_LENGTH = 16;

function secret() {
  const value = process.env.OPT_OUT_SECRET;
  if (!value) {
    throw new Error("OPT_OUT_SECRET is missing, so an opt-out link cannot be signed.");
  }
  return value;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(phone: string) {
  return createHmac("sha256", secret()).update(phone).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

/** الأرقام بتوصل بأشكال (`+972…` · `972…` · فراغات) والبصمة لازم تكون على شكل واحد. */
export function canonicalPhone(phone: string) {
  return (phone ?? "").replace(/[^\d]/g, "");
}

export function issueOptOutToken(phone: string) {
  const digits = canonicalPhone(phone);
  if (!digits) {
    throw new Error("A phone number is needed to issue an opt-out link.");
  }
  return `${b64url(digits)}.${sign(digits)}`;
}

/** بيرجّع الرقم إذا البصمة صحّت، و`null` غير هيك — بلا ما يفرّق السبب. */
export function phoneFromOptOutToken(token: string): string | null {
  const raw = (token ?? "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return null;
  }

  let digits: string;
  try {
    digits = Buffer.from(raw.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (!digits || digits !== canonicalPhone(digits)) {
    return null;
  }

  const given = Buffer.from(raw.slice(dot + 1));
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(digits));
  } catch {
    return null;
  }

  // المقارنة بوقت ثابت، وبس لما الطولين متساويين — `timingSafeEqual`
  // بترمي على طول مختلف.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  return digits;
}

export function optOutLink(phone: string, base = process.env.PUBLIC_BASE_URL || "https://www.afkarheartbeat.com") {
  return `${base.replace(/\/+$/, "")}/stop/${issueOptOutToken(phone)}`;
}

/**
 * التوكن القصير — لرسائل الـSMS.
 *
 * 🔑 **ليش نسخة تانية:** توكن `/stop/` فيه الرقم كاملاً وبصمة ١٦ حرف،
 * فالرابط بيطلع ٦٢ حرف. بالـSMS العربي المقطع ٧٠ حرف — يعني الرابط
 * لحاله بياكل مقطع، وكل مقطع زيادة = ٥ آلاف رسالة زيادة على دفعة
 * الـ٥ آلاف.
 *
 * فالقصير بيحمل **معرّف الصف** بـbase36 بدل الرقم، وبصمة ٧ أحرف
 * base64url (42 بت). التزوير بدّه ٢ أس ٤٢ محاولة على فعل **عكوس**
 * (الطاقم بيرجّع بكبسة) — فالمقايضة مقبولة هون وما بتنطبق على `/stop/`.
 */
const SHORT_SIGNATURE_LENGTH = 7;

function shortSign(id: number) {
  return createHmac("sha256", secret()).update(`m${id}`).digest("base64url").slice(0, SHORT_SIGNATURE_LENGTH);
}

export function issueShortOptOutToken(memberId: number) {
  if (!Number.isInteger(memberId) || memberId <= 0) {
    throw new Error("A member id is needed to issue a short opt-out link.");
  }
  return `${memberId.toString(36)}.${shortSign(memberId)}`;
}

/** بيرجّع معرّف الصف إذا البصمة صحّت، و`null` غير هيك. */
export function memberIdFromShortToken(token: string): number | null {
  const raw = (token ?? "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return null;
  }

  const id = Number.parseInt(raw.slice(0, dot), 36);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const given = Buffer.from(raw.slice(dot + 1));
  let expected: Buffer;
  try {
    expected = Buffer.from(shortSign(id));
  } catch {
    return null;
  }

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  return id;
}

export function shortOptOutLink(
  memberId: number,
  base = process.env.PUBLIC_BASE_URL || "https://www.afkarheartbeat.com"
) {
  return `${base.replace(/\/+$/, "")}/s/${issueShortOptOutToken(memberId)}`;
}
