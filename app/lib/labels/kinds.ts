/**
 * The four axes Afkar already works in, taken from her own WhatsApp lists.
 * Client-safe: the screens draw the same kinds the server stores.
 */

export const LABEL_KINDS = ["path", "batch", "state", "coach", "other"] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

export const KIND_LABEL: Record<LabelKind, string> = {
  path: "مسار",
  batch: "دفعة",
  state: "حالة",
  coach: "مرافِقة",
  other: "أخرى"
};

export const KIND_DETAIL: Record<LabelKind, string> = {
  path: "البرنامج الذي ينتسب إليه: كلين، إكسترا بلس، ستيب. يبقى على المنتسب بعد انتهاء الدفعة.",
  batch: "دفعة بتاريخ بداية: 16.8، 1.10، كلين 10. هي ما يُشغَّل عليه جدول الرسائل.",
  state: "وضع حالي: متابعة مسار، بانتظار أفكار، حامل، زيادة في الوزن.",
  coach: "من يتابع المنتسب. المرافقة الآن حساب مستخدم، لا ملصق.",
  other: "تصنيف لا يندرج تحت ما سبق."
};

/** The tone each kind is drawn in, from the palette the screens already use. */
export const KIND_TONE: Record<LabelKind, string> = {
  path: "apricot",
  batch: "mint",
  state: "rose",
  coach: "mauve",
  other: "salmon"
};

/** The two states the system keeps up to date by itself. */
export const MANAGED_FOLLOWING = "following";
export const MANAGED_AWAITING = "awaiting";

export const MANAGED_NAME: Record<string, string> = {
  [MANAGED_FOLLOWING]: "متابعة مسار",
  [MANAGED_AWAITING]: "بانتظار أفكار"
};

export function isLabelKind(value: string): value is LabelKind {
  return (LABEL_KINDS as readonly string[]).includes(value);
}
