import { findMemberByPhone, getDb, getMember, type Member } from "../db";
import { recordAction } from "../users/audit";

/**
 * «ما بديش أستلم هيك رسائل».
 *
 * الطلب بينسجّل ولا بيمحي: الرقم بيضل بأعضاء النادي معلَّم «طلب حذف»،
 * والمحادثة والتاريخ بيضلوا. ليش:
 *  · المحو بيمحي معه كل المسار والدفعات، وبيخلّي نفس الرقم يترجّع
 *    لحملة بعد شهر كأنه ما طلب ولا إشي — يعني المحو بيكسر نفس الوعد
 *    اللي بيفترض يحميه.
 *  · ووسام بدّو يشوف المحذوفين بقائمة أعضاء النادي، فلازم يضلوا موجودين.
 *
 * شو بيوقف فعلياً: التسويق — الحملات، والقوالب اللي ميتا مصنّفتها
 * MARKETING. رسائل المسار والخدمة لمنتسب دافع بتضل تمشي، لأن اللي طلب
 * يوقف العروض ما طلب يوقف برنامجه. (قرار موثّق، إذا وسام بدّه كل إشي
 * يوقف الحارس بـ`isMarketing` بينشال.)
 */

export type OptOutSource = "link" | "reply" | "admin";

export const OPT_OUT_SOURCE_LABEL: Record<OptOutSource, string> = {
  link: "من رابط الرسالة",
  reply: "رد على الواتساب",
  admin: "بإيد الطاقم"
};

/**
 * الكلمات اللي بتعني «وقّف». المطابقة على **كل** نص الرسالة مش على جزء
 * منها بالمقصود: «وقف» جوّا «ما بقدر أوقف الأكل» مش طلب إيقاف، وإيقاف
 * الغلط بيوقف العروض عن زبونة فعلية.
 */
const STOP_PHRASES = [
  "ايقاف",
  "إيقاف",
  "وقف",
  "وقفو",
  "وقفوا",
  "الغاء",
  "إلغاء",
  "الغاء الاشتراك",
  "إلغاء الاشتراك",
  "ايقاف الرسائل",
  "إيقاف الرسائل",
  "وقفو الرسائل",
  "وقفوا الرسائل",
  "لا تبعتولي",
  "ما بديش رسائل",
  "مش بدي رسائل",
  "stop",
  "unsubscribe",
  "להסיר",
  "הסר",
  "הסרה"
];

/** بتشيل التشكيل والمدّات وعلامات الترقيم، وبتوحّد الألف والتاء والياء. */
function flattenArabic(text: string) {
  return (text ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FLAT_STOP = new Set(STOP_PHRASES.map(flattenArabic));

/**
 * الرجعة. منوعد فيها بنص التأكيد، فلازم تكون مبنية — وعد بلا تنفيذ أسوأ
 * من بلا وعد.
 */
const RESUME_PHRASES = ["ارجعوني", "رجعوني", "ارجعوا", "رجعوا", "بدي ارجع", "اشتراك", "start", "subscribe"];

const FLAT_RESUME = new Set(RESUME_PHRASES.map(flattenArabic));

export function isResumeRequest(text: string) {
  const flat = flattenArabic(text);
  if (!flat || flat.split(" ").length > 4) {
    return false;
  }
  return FLAT_RESUME.has(flat);
}

export function isStopRequest(text: string) {
  const flat = flattenArabic(text);
  if (!flat) {
    return false;
  }
  // رسالة طويلة فيها كلمة «وقف» مش طلب إيقاف. حدّ الأربع كلمات بيسمح
  // بـ«بدي إيقاف الرسائل» وبيرفض فقرة.
  if (flat.split(" ").length > 4) {
    return false;
  }
  return FLAT_STOP.has(flat);
}

export function isOptedOut(member: Pick<Member, "optOutAt">) {
  return Boolean(member.optOutAt);
}

export function isPhoneOptedOut(phone: string) {
  const member = findMemberByPhone(phone);
  return member ? isOptedOut(member) : false;
}

/**
 * بيسجّل الطلب. مرتجع `null` لما الرقم مش عنا — رابط لرقم ما بيقابل
 * صفّاً ما بيصير صفّ جديد: هيك بينفتح باب تعبئة الجدول من برا.
 */
export function requestOptOut(input: {
  memberId?: number;
  phone?: string;
  source: OptOutSource;
  note?: string;
  byUserId?: number | null;
  actor?: string;
}) {
  const member = input.memberId ? getMember(input.memberId) : input.phone ? findMemberByPhone(input.phone) : null;
  if (!member) {
    return null;
  }

  // الطلب الثاني ما بيحرّك التاريخ: أول مرة طلب فيها هي اللي بتهمّ.
  if (!member.optOutAt) {
    getDb()
      .prepare("UPDATE members SET opt_out_at = ?, opt_out_source = ?, opt_out_note = ? WHERE id = ?")
      .run(new Date().toISOString(), input.source, (input.note ?? "").trim(), member.id);

    recordAction({
      userId: input.byUserId ?? null,
      actor: input.actor ?? OPT_OUT_SOURCE_LABEL[input.source],
      action: "member.optout",
      subjectType: "member",
      subjectId: member.id,
      subjectLabel: member.name || member.phone,
      detail: `طلب إيقاف الرسائل — ${OPT_OUT_SOURCE_LABEL[input.source]}${input.note ? ` · ${input.note}` : ""}`
    });
  }

  return getMember(member.id);
}

/** الرجعة بالإيد بس: الطاقم بيشيل العلامة لما المنتسبة تطلب هي ترجع. */
export function undoOptOut(memberId: number, by: { userId: number | null; actor: string }) {
  const member = getMember(memberId);
  if (!member || !member.optOutAt) {
    return member;
  }

  getDb()
    .prepare("UPDATE members SET opt_out_at = NULL, opt_out_source = '', opt_out_note = '' WHERE id = ?")
    .run(memberId);

  recordAction({
    userId: by.userId,
    actor: by.actor,
    action: "member.optout.undo",
    subjectType: "member",
    subjectId: memberId,
    subjectLabel: member.name || member.phone,
    detail: "إرجاع الرسائل بعد طلب إيقاف"
  });

  return getMember(memberId);
}

export function countOptedOut() {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM members WHERE opt_out_at IS NOT NULL").get() as {
    n: number;
  };
  return row.n;
}

export function listOptedOut(options: { limit?: number; offset?: number } = {}) {
  const clause = options.limit ? " LIMIT ? OFFSET ?" : "";
  const args = options.limit ? [options.limit, options.offset ?? 0] : [];
  const rows = getDb()
    .prepare(`SELECT id FROM members WHERE opt_out_at IS NOT NULL ORDER BY opt_out_at DESC${clause}`)
    .all(...args) as Array<{ id: number }>;
  return rows.map((row) => getMember(row.id)).filter((member): member is Member => Boolean(member));
}
