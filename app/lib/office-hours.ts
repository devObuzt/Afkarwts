/**
 * ساعات عمل أفكار، بتوقيت البلاد.
 *
 * الجدول كما بعته وسام 29.10. الأربعاء مذكور مرتين عنده — مرة ضمن
 * «الأحد–الخميس» ومرة لحاله بساعات أقصر — والخاص بيغلب العام، لأنه ما في
 * معنى تاني لذكره لحاله.
 *
 * 🕐 لتعديل الساعات: هاد المحل الوحيد. بلا نشر جديد ما بتتغيّر — لو صارت
 * بتتغيّر كل شهر (رمضان، أعياد) بتستاهل شاشة إعدادات.
 */
const JERUSALEM = "Asia/Jerusalem";

type Window = { from: number; to: number };

/** دقائق من منتصف الليل، عشان المقارنة تصير بأرقام مش بنصوص. */
const at = (hour: number, minute = 0) => hour * 60 + minute;

/** 0 = الأحد … 6 = السبت. `null` يعني عطلة اليوم كله. */
const WEEK: Record<number, Window | null> = {
  0: { from: at(9), to: at(19) }, // الأحد
  1: { from: at(9), to: at(19) }, // الاثنين
  2: { from: at(9), to: at(19) }, // الثلاثاء
  3: { from: at(9), to: at(17) }, // الأربعاء — أقصر، والخاص بيغلب العام
  4: { from: at(9), to: at(19) }, // الخميس
  5: { from: at(10), to: at(15) }, // الجمعة
  6: null // السبت — مسارات، عطلة
};

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: JERUSALEM,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

/**
 * اليوم والدقيقة بتوقيت البلاد لأي لحظة.
 *
 * بينقرا من `Intl` مش بحساب فرق ساعات ثابت — التوقيت الصيفي بيتغيّر مرتين
 * بالسنة، وأي رقم ثابت بينكسر فيهن بصمت.
 */
function localPoint(instant: Date) {
  const parts = PARTS.formatToParts(instant);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(pick("hour"));
  return {
    day: DAY_INDEX[pick("weekday")] ?? 0,
    // منتصف الليل بيطلع "24" عند بعض النسخ.
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(pick("minute"))
  };
}

/** هل المكتب شغّال بهاي اللحظة؟ */
export function isOpen(instant: Date = new Date()) {
  const { day, minutes } = localPoint(instant);
  const window = WEEK[day];
  if (!window) {
    return false;
  }
  // الساعة 19:00 بالضبط = سكّرنا. البداية بتدخل والنهاية لأ.
  return minutes >= window.from && minutes < window.to;
}

/**
 * آخر لحظة كان فيها المكتب مفتوح قبل الآن — أو `null` إذا هو مفتوح هلق.
 *
 * بترجّع للورا بخطوات ربع ساعة بدل ما تحسب لحظة الإغلاق من التاريخ: بناء
 * لحظة من «تاريخ محلي + ساعة» بيتعثّر بالتوقيت الصيفي، بينما `isOpen`
 * بتقرا المنطقة من `Intl` كل مرة فما بتغلط. وأطول إغلاق بالجدول هو
 * الجمعة 15:00 ← الأحد 9:00 = 42 ساعة، فـ168 خطوة بتغطيه مرتين.
 */
export function lastOpenBefore(instant: Date = new Date()) {
  if (isOpen(instant)) {
    return null;
  }
  const STEP_MS = 15 * 60 * 1000;
  for (let back = 1; back <= 4 * 24 * 4; back += 1) {
    const moment = new Date(instant.getTime() - back * STEP_MS);
    if (isOpen(moment)) {
      return moment;
    }
  }
  return null;
}

/** للعرض: «الأحد–الخميس 9:00–19:00…» بيتولّد من نفس الجدول مش منسوخ بالإيد. */
export function scheduleIsOpenAt(day: number, minutes: number) {
  const window = WEEK[day];
  return Boolean(window && minutes >= window.from && minutes < window.to);
}
