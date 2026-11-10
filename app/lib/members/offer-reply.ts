import { ensureManagedLabel } from "../labels/store";
import { addLabel } from "../labels/store";

/**
 * الجواب على زر العرض بالحملة.
 *
 * 🔑 **ليش هاد لازم:** كل كبسة رد سريع بتوصل كرسالة واصلة — بتنخزّن
 * بالمحادثة، بتفتح نافذة 24 ساعة، **وبتدقّ إشعار على تلفونات الطاقم**.
 * حملة على ألف رقم فيها زر «ما في داعي» بتولّد مئات الكبسات؛ بلا تعامل
 * خاص، الإنبوكس بيغرق والطاقم بيوقف يقرا الإشعارات — فتضيع معها
 * الكبسات اللي بتعني زبونة.
 *
 * فالقرار: **«بدي العرض» بتدقّ، و«ما في داعي» بتنسجّل بهدوء.** الاثنتين
 * بينكتبوا بالمحادثة زي أي رسالة، بس الإشعار بيروح لليد مش للرفض.
 *
 * و«ما في داعي» **مش هسرة**: هي رفض لهاد العرض. الهسرة إلها زر لحالها.
 */

export type OfferAnswer = "yes" | "no" | null;

/** نصوص الأزرار كما انعتمدت عند ميتا — ما بتزحزح لأن القالب معتمد عليها. */
const YES = ["بدي العرض", "نعم بدي العرض", "يا ريت", "معني", "معنية", "معنيه", "نعم", "أكيد"];
const NO = ["ما في داعي", "شكراً لا أريد", "شكرا لا اريد", "ما في داعي شكراً", "لا", "مش ضروري", "مش هلق"];

function flatten(text: string) {
  return (text ?? "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FLAT_YES = new Set(YES.map(flatten));
const FLAT_NO = new Set(NO.map(flatten));

export function offerAnswer(pressed: string): OfferAnswer {
  const flat = flatten(pressed);
  if (!flat) {
    return null;
  }
  if (FLAT_YES.has(flat)) {
    return "yes";
  }
  if (FLAT_NO.has(flat)) {
    return "no";
  }
  return null;
}

/**
 * بتسجّل الرفض كملصق، عشان يطلع بالفلاتر وبتقدر أفكار تشوف مين رفض
 * آخر عرضين قبل ما تبعتله تالت.
 */
export function recordOfferDecline(memberId: number) {
  const label = ensureManagedLabel("رفض عرض", "state");
  addLabel(memberId, label.id, false);
  return label;
}
