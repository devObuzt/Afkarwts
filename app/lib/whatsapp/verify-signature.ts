import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * هل هاي الحمولة فعلاً من ميتا؟
 *
 * ميتا بتوقّع كل POST بـHMAC-SHA256 على **الجسم الخام** بسرّ التطبيق،
 * وبتبعته بترويسة `X-Hub-Signature-256`. بلا هاد الفحص الرابط مفتوح:
 * أي حدا بيعرف العنوان بيقدر يزرع رسائل وهمية بالمنظومة — وبعد ما صار في
 * ردّ تلقائي، بيقدر كمان **يخلّينا نبعت واتساب لأي رقم بيسمّيه**، على
 * حساب أفكار وعلى سمعة رقمها عند ميتا.
 *
 * بتقارن بـ`timingSafeEqual` مش بـ`===`: المقارنة العادية بتوقف عند أول
 * حرف مختلف، وفرق الوقت بيسرّب التوقيع حرف حرف.
 */
export function verifyMetaSignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;

  // مش مضبوط = ما منقدر نتحقق. بنرجّع «مش متحقَّق» مش «سليم».
  if (!secret) {
    return { configured: false, valid: false };
  }

  if (!header?.startsWith("sha256=")) {
    return { configured: true, valid: false };
  }

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), "utf8");
  const given = Buffer.from(header.slice("sha256=".length), "utf8");

  if (expected.length !== given.length) {
    return { configured: true, valid: false };
  }

  return { configured: true, valid: timingSafeEqual(expected, given) };
}
