import { createMessage, getDb, type Member } from "../db";
import { isOpen, lastOpenBefore } from "../office-hours";
import { sendWhatsAppText } from "../whatsapp";

/**
 * الردود التلقائية على الرسائل الواصلة.
 *
 * 🔑 ما بدها قالب معتمد: الرد بيجي على رسالة واصلة، ورسالتها هي اللي
 * بتفتح نافذة الـ24 ساعة — يعني وقت الإرسال النافذة مفتوحة بحكم التعريف،
 * والنص الحر بيمشي ومجاني. القالب كان بيجبرنا على مراجعة ميتا كل مرة
 * بتتغيّر فيها ساعة.
 */

/** النصوص كما بعتهن وسام 29.10 — بتتعدّل هون وبتنشر، بلا مراجعة من حدا. */
export const AFTER_HOURS_TEXT = `نحن خارج نطاق ساعات العمل❗️
لا تقلقوا 🫶 سنعاود التواصل معكم بأقرب وقت ⏰ 

*ساعات العمل ومتابعة المشتركين:*
الاحد - الخميس :  9:00-19:00
الاربعاء : 9:00-17:00
الجمعة  : 10:00 - 15:00

السبت  - مسارات - عطلة

زوروني في الموقع لتعرفوا اكتر تفاصيل وامكانيات التسجيل 

https://eat-love-fit.com/programs/clean/

Afkar-Eat.Love.Fit
🌿🌸🌿`;

export const WELCOME_TEXT = `شكرا لتواصلك ☺️
رح نرجعلك في اقرب وقت🙏

لبين ما نرجعلك، متوفر كل التفاصيل في الموقع لتعرفوا اكتر تفاصيل وكمان لإمكانيات التسجيل والاشتراك 

https://eat-love-fit.com/programs/clean/

Afkar-Eat.Love.Fit 
🌿🌸🌿`;

/**
 * تأكيد الإيقاف. اللي كتب «وقفوا» لازم يعرف إنه وصل، وإلا بيكرّرها —
 * والأهم: بلا تأكيد هو ما بيعرف إذا صار إشي أصلاً.
 *
 * بينبعت بدل الترحيب مش معه: «ما بديش رسائل» و«شكرا لتواصلك رح نرجعلك»
 * بنفس الدقيقة بتقرا كإنّ ولا حد سامع.
 */
export const STOPPED_TEXT = `تم ✅
أوقفنا رسائل العروض والحملات عن هذا الرقم.

رح تضل تستلم رسائل برنامجك إذا كنت مشتركة بمسار، وبتقدري ترجعي أي وقت — بس ابعتي «ارجعوني».

Afkar-Eat.Love.Fit
🌿🌸🌿`;

/** بتميّز رسائلنا التلقائية عن كلام البشر، بعمود `send_key` الموجود أصلاً. */
export const AFTER_HOURS_KEY = "auto:after-hours";
export const WELCOME_KEY = "auto:welcome";
export const STOPPED_KEY = "auto:stopped";

type Decision = { kind: "after-hours" | "welcome" | "stopped"; text: string; key: string } | null;

/**
 * شو بينبعت — إذا كان في إشي بينبعت أصلاً.
 *
 * منفصلة عن الإرسال عشان تنفحص بلا شبكة: القرار هو اللي فيه القواعد،
 * والإرسال سطرين.
 */
export function decideAutoReply(memberId: number, now: Date = new Date()): Decision {
  const db = getDb();

  // التأكيد بيسبق كل إشي: اللي طلب يوقف ما بيستاهل يستلم ترحيب.
  // بينبعت برا ساعات العمل كمان — الإيقاف صار فعلاً وقت الطلب، فتأكيده
  // بكرا الصبح متأخّر.
  const stopped = db
    .prepare("SELECT opt_out_at, opt_out_source FROM members WHERE id = ?")
    .get(memberId) as { opt_out_at: string | null; opt_out_source: string | null } | undefined;

  // التأكيد بينبعت للطلب اللي إجا **بالواتساب** بس. اللي كبس الرابط شاف
  // التأكيد بالصفحة، ولو بعتناله كمان رسالة بعد أسبوع لما يكتب «مرحبا»
  // بيقرا جواب على «مرحبا» — مش على طلب عمله وخلص.
  if (stopped?.opt_out_at && stopped.opt_out_source === "reply") {
    const confirmed = (
      db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ? AND send_key = ? AND created_at >= ?")
        .get(memberId, STOPPED_KEY, stopped.opt_out_at.replace("T", " ").slice(0, 19)) as { n: number }
    ).n;

    if (confirmed === 0) {
      return { kind: "stopped", text: STOPPED_TEXT, key: STOPPED_KEY };
    }
  }

  // 🔑 رسائلنا التلقائية ما بتحسب محادثة. بلا هاد الاستثناء، رد «خارج
  // الدوام» الساعة 2 بالليل بيخلّي الواحد «مش جديد»، فالترحيب ما بيوصله
  // ولا مرة — وهو بعدُه ما حكى مع إنسان.
  const humanMessages = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages
          WHERE member_id = ?
            AND (send_key IS NULL OR send_key NOT LIKE 'auto:%')`
      )
      .get(memberId) as { n: number }
  ).n;

  if (!isOpen(now)) {
    // مرة وحدة بكل فترة إغلاق: اللي بيبعت خمس رسائل الساعة 2 ما بيستاهل
    // خمس ردود. وبكرا بعد الدوام بترجع تشتغل من جديد.
    const since = lastOpenBefore(now);
    const already = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
            WHERE member_id = ? AND send_key = ? AND created_at >= ?`
        )
        .get(memberId, AFTER_HOURS_KEY, (since ?? new Date(0)).toISOString().replace("T", " ").slice(0, 19)) as {
        n: number;
      }
    ).n;

    return already > 0 ? null : { kind: "after-hours", text: AFTER_HOURS_TEXT, key: AFTER_HOURS_KEY };
  }

  // بالدوام: الترحيب لأول رسالة من عنده وبس — الرسالة الواصلة هلق هي
  // الوحيدة بالمحادثة.
  if (humanMessages > 1) {
    return null;
  }

  const welcomed = (
    db.prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ? AND send_key = ?").get(
      memberId,
      WELCOME_KEY
    ) as { n: number }
  ).n;

  return welcomed > 0 ? null : { kind: "welcome", text: WELCOME_TEXT, key: WELCOME_KEY };
}

/**
 * بتبعت الرد وبتسجّله بالمحادثة.
 *
 * ما بترمي: الردّ التلقائي خدمة إضافية، وفشله ما بيستاهل يوقّف استقبال
 * الرسالة اللي جابته.
 */
export async function sendAutoReply(member: Member, now: Date = new Date()) {
  const decision = decideAutoReply(member.id, now);
  if (!decision) {
    return null;
  }

  try {
    const messageId = await sendWhatsAppText(member, decision.text);
    createMessage({
      memberId: member.id,
      direction: "outgoing",
      body: decision.text,
      whatsappMessageId: messageId,
      status: "sent",
      sendKey: decision.key
    });
    return decision.kind;
  } catch (error) {
    // الفشل بينتسجّل بالمحادثة مش بس باللوج: ردّ تلقائي بيوقف بصمت معناه
    // إنّ اللي بتكتب الساعة 2 ما بيوصلها إشي ولا حدا بيعرف. وبما إنه
    // بينتسجّل بنفس المفتاح، قاعدة «مرة بكل فترة إغلاق» بتمنع تكراره.
    createMessage({
      memberId: member.id,
      direction: "outgoing",
      body: decision.text,
      status: "failed",
      error: error instanceof Error ? error.message : "تعذّر إرسال الرد التلقائي.",
      sendKey: decision.key
    });
    console.error("Auto-reply failed:", error);
    return null;
  }
}
