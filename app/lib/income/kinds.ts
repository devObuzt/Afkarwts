/**
 * What the income screen names things. Client-safe: no database, no node.
 */

/** Morning's own payment codes. Only what the live data actually contains is named. */
export const METHOD_LABEL: Record<number, string> = {
  1: "نقداً",
  2: "شيك",
  3: "بطاقة اعتماد",
  4: "حوالة بنكية",
  5: "PayPal",
  10: "تطبيق دفع (بيت)",
  11: "أخرى"
};

export function methodName(code: number) {
  return METHOD_LABEL[code] ?? `وسيلة ${code}`;
}

export const SOURCES = ["website", "app", "sales"] as const;
export type IncomeSource = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<IncomeSource, string> = {
  website: "الموقع",
  app: "التطبيق",
  sales: "مبيعات"
};

export const SOURCE_DETAIL: Record<IncomeSource, string> = {
  website: "طلب من المتجر: الفاتورة تحمل رقم الطلب، أو رقم هاتفها يطابق طلباً في المتجر.",
  app: "طلب من تطبيق أفكار. لم يُطلق بعد، فالرقم صفر حتى ذلك الحين.",
  sales: "بيع مباشر: حوالة بنكية أو رابط دفع أرسله الفريق. كل ما لا يقابله طلب في المتجر."
};

export const SOURCE_TONE: Record<IncomeSource, string> = {
  website: "mint",
  app: "mauve",
  sales: "apricot"
};

export type Range = "today" | "week" | "month" | "last-month" | "custom";

export const RANGE_LABEL: Record<Range, string> = {
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  "last-month": "الشهر الماضي",
  custom: "مدة مخصصة"
};
