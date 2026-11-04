/**
 * Foods, meal templates, programs and her plan in Afkar's member app, as HeartBeat edits them.
 * These are the rules for what the forms send; the app checks everything again on its side.
 */

export type Text = { ar: string; he?: string; en?: string };
export type AppPortion = { id: string; label: Text; grams: number };
export type AppFood = {
  id: string; name: Text; category: string | null; owner: string; portions: AppPortion[];
  per100: { kcal: number; protein: number; carb: number; fat: number };
  synonyms: string[]; status: "draft" | "official"; barcode: string | null;
};
export type SlotType = "protein" | "carb" | "veg" | "fat" | "drink" | "other";
export type AppAlternative = { food_id: string; portion_id: string; qty: number; qty_manual: boolean };
export type AppSlot = { id: string; slot_type: SlotType; food_id: string; portion_id: string; qty: number; alternatives: AppAlternative[] };
export type AppTemplateRow = { id: string; owner: string; name: Text; default_time: string | null; version: number };
export type AppTemplate = AppTemplateRow & { note: Text | null; slots: AppSlot[] };
export type Goals = { kcal?: number; protein?: number; carb?: number; fat?: number };
export type AppProgramFull = {
  id: string; key: string; owner: string; name: Text; length_days: number; weigh_in_days: number[]; teen_mode: boolean;
  goals: Goals | null; version: number; days: Array<{ meal_template_ids: string[]; content: Text | null }>;
};
type Values = { kcal: number; protein: number; carb: number; fat: number };
type Ref = { qty_manual?: boolean; food: { id: string; name: Text }; portion: { id: string; label: Text; grams: number }; qty: number; values?: Values };
export type AppDayItem = Ref & { id: string; slot_type: SlotType; alternatives: Array<Ref & { index: number }>; logged: { log_id: string; kind: string; alt_index: number | null } | null };
export type AppDay = {
  date: string; status: string; starts_on: string | null; program: { key: string; name: Text } | null; day_index: number | null; cycle_day?: number; is_weigh_in: boolean;
  content: Text | null; meals: Array<{ id: string; name: Text; time: string | null; note: Text | null; items: AppDayItem[] }>;
  progress: { items_planned: number; items_done: number }; totals?: Values; goals?: Goals;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Afkar's team types on Arabic keyboards: ٠-٩ and ٫ are the same numbers. */
const latin = (v: unknown) => str(v).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const number = (v: unknown): number | null => {
  const s = latin(v).replace("٫", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const within = (v: unknown, min: number, max: number) => {
  const n = number(v);
  return n !== null && n >= min && n <= max ? n : null;
};
/** The form edits Arabic; the other languages it came with stay. */
const text = (v: unknown, had?: Text | null): Text | undefined => (str(v) ? { ...(had ?? {}), ar: str(v) } : undefined);
export const parseAmount = number;

export type FoodForm = {
  ar: string; he: string; en: string; synonyms: string; category: string;
  kcal: string; protein: string; carb: string; fat: string; portions: Array<{ id?: string; label: string; grams: string; text?: Text }>;
};
export type FoodBody = {
  name: Text; synonyms: string[]; category?: string; per100: Values;
  portions: Array<{ id?: string; label: Text; grams: number }>;
};

export function foodPayload(form: FoodForm): { ok: true; body: FoodBody } | { ok: false; error: "NAME" | "VALUES" } | { ok: false; error: "PORTION"; row: number } {
  const ar = str(form.ar);
  if (!ar || ar.length > 200) return { ok: false, error: "NAME" };
  const kcal = within(form.kcal, 0, 1000), protein = within(form.protein, 0, 100), carb = within(form.carb, 0, 100), fat = within(form.fat, 0, 100);
  if (kcal === null || protein === null || carb === null || fat === null || protein + carb + fat > 100.5) return { ok: false, error: "VALUES" };
  const portions: FoodBody["portions"] = [];
  for (const [row, p] of form.portions.entries()) {
    const label = str(p.label);
    const grams = within(p.grams, 0.01, 5000);
    if (!label || label.length > 200 || grams === null) return { ok: false, error: "PORTION", row };
    portions.push({ ...(p.id ? { id: p.id } : {}), label: { ...(p.text ?? {}), ar: label }, grams });
  }
  const category = str(form.category).slice(0, 40);
  return {
    ok: true,
    body: {
      name: { ar, ...(str(form.he) ? { he: str(form.he).slice(0, 200) } : {}), ...(str(form.en) ? { en: str(form.en).slice(0, 200) } : {}) },
      synonyms: str(form.synonyms).split(/[,،]/).map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 30),
      ...(category ? { category } : {}), per100: { kcal, protein, carb, fat }, portions
    }
  };
}

export type AltForm = { food_id: string; portion_id: string; qty: string };
export type SlotForm = { slot_type: string; food_id: string; portion_id: string; qty: string; alternatives: AltForm[] };
type AltBody = { food_id: string; portion_id: string; qty?: number };
type SlotBody = { slot_type: string; food_id: string; portion_id: string; qty: number; alternatives: AltBody[] };

/** An alternative left empty is counted by the app from the values; one typed stays as typed. */
function alternatives(rows: AltForm[]): AltBody[] | null {
  const out: AltBody[] = [];
  for (const a of rows) {
    if (!a.food_id || !a.portion_id) return null;
    if (str(a.qty) === "") { out.push({ food_id: a.food_id, portion_id: a.portion_id }); continue; }
    const qty = within(a.qty, 0.01, 50);
    if (qty === null) return null;
    out.push({ food_id: a.food_id, portion_id: a.portion_id, qty });
  }
  return out;
}

export type TemplateForm = { name: string; time: string; note: string; name_text?: Text; note_text?: Text | null; slots: SlotForm[] };
export type TemplateBody = { name: Text; default_time?: string; note?: Text; slots: SlotBody[] };

export function templatePayload(form: TemplateForm): { ok: true; body: TemplateBody } | { ok: false; error: "NAME" | "TIME" | "EMPTY" } | { ok: false; error: "FOOD" | "QTY"; row: number } {
  const name = str(form.name);
  if (!name || name.length > 200) return { ok: false, error: "NAME" };
  const time = latin(form.time);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "TIME" };
  if (form.slots.length === 0 || form.slots.length > 20) return { ok: false, error: "EMPTY" };
  const slots: SlotBody[] = [];
  for (const [row, s] of form.slots.entries()) {
    if (!s.food_id || !s.portion_id) return { ok: false, error: "FOOD", row };
    const qty = within(s.qty, 0.01, 50);
    const alts = alternatives(s.alternatives);
    if (qty === null || alts === null) return { ok: false, error: "QTY", row };
    slots.push({ slot_type: s.slot_type, food_id: s.food_id, portion_id: s.portion_id, qty, alternatives: alts });
  }
  const note = text(form.note, form.note_text);
  return { ok: true, body: { name: { ...(form.name_text ?? {}), ar: name }, ...(time ? { default_time: time } : {}), ...(note ? { note } : {}), slots } };
}

export type GoalsForm = { kcal: string; protein: string; carb: string; fat: string };
const GOAL_MAX: Record<keyof Goals, number> = { kcal: 6000, protein: 400, carb: 800, fat: 300 };

export function goalsPayload(form: GoalsForm): { ok: true; goals: Goals } | { ok: false; error: "GOALS" } {
  const goals: Goals = {};
  for (const key of ["kcal", "protein", "carb", "fat"] as const) {
    if (str(form[key]) === "") continue;
    const n = within(form[key], 1, GOAL_MAX[key]);
    if (n === null || !Number.isInteger(n)) return { ok: false, error: "GOALS" };
    goals[key] = n;
  }
  return { ok: true, goals };
}

export type ProgramForm = {
  key: string; name: string; name_text?: Text; length_days: string; weigh_in: string; teen_mode: boolean; goals: GoalsForm;
  days: Array<{ meal_template_ids: string[]; content: string; content_text?: Text | null }>;
};
export type ProgramBody = {
  key: string; name: Text; length_days: number; weigh_in_days: number[]; teen_mode: boolean; goals?: Goals;
  days: Array<{ meal_template_ids: string[]; content?: Text }>;
};

export function programPayload(form: ProgramForm): { ok: true; body: ProgramBody } | { ok: false; error: "KEY" | "NAME" | "LENGTH" | "WEIGH_IN" | "GOALS" | "EMPTY" } | { ok: false; error: "DAY"; row: number } {
  const key = str(form.key);
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return { ok: false, error: "KEY" };
  const name = str(form.name);
  if (!name || name.length > 200) return { ok: false, error: "NAME" };
  const length = within(form.length_days, 1, 730);
  if (length === null || !Number.isInteger(length)) return { ok: false, error: "LENGTH" };
  if (form.days.length === 0 || form.days.length > 31) return { ok: false, error: "EMPTY" };
  const days: ProgramBody["days"] = [];
  for (const [row, d] of form.days.entries()) {
    if (d.meal_template_ids.length === 0 || d.meal_template_ids.length > 12) return { ok: false, error: "DAY", row };
    const content = text(d.content, d.content_text);
    days.push({ meal_template_ids: d.meal_template_ids, ...(content ? { content } : {}) });
  }
  // A teen has no goals and no weigh-in, whatever was left in the form before the box was ticked.
  if (form.teen_mode) return { ok: true, body: { key, name: { ...(form.name_text ?? {}), ar: name }, length_days: length, weigh_in_days: [], teen_mode: true, days } };

  const weighIn: number[] = [];
  for (const part of str(form.weigh_in).split(/[,،\s]+/).filter(Boolean)) {
    const day = within(part, 1, length);
    if (day === null || !Number.isInteger(day)) return { ok: false, error: "WEIGH_IN" };
    weighIn.push(day - 1); // typed from day 1, stored from 0
  }
  const goals = goalsPayload(form.goals);
  if (!goals.ok) return { ok: false, error: "GOALS" };
  return {
    ok: true,
    body: {
      key, name: { ...(form.name_text ?? {}), ar: name }, length_days: length, weigh_in_days: [...new Set(weighIn)].sort((a, b) => a - b), teen_mode: false,
      ...(Object.keys(goals.goals).length ? { goals: goals.goals } : {}), days
    }
  };
}

export function planItemPayload(form: { food_id: string; portion_id: string; qty: string; alternatives: AltForm[] }):
  { ok: true; body: { food_id: string; portion_id: string; qty: number; alternatives: AltBody[] } } | { ok: false; error: "FOOD" | "QTY" } {
  if (!form.food_id || !form.portion_id) return { ok: false, error: "FOOD" };
  const qty = within(form.qty, 0.01, 50);
  const alts = alternatives(form.alternatives);
  if (qty === null || alts === null) return { ok: false, error: "QTY" };
  return { ok: true, body: { food_id: form.food_id, portion_id: form.portion_id, qty, alternatives: alts } };
}

export function planMealPayload(form: { time: string; note: string; note_text?: Text | null }):
  { ok: true; body: { time: string | null; note: Text | null } } | { ok: false; error: "TIME" } {
  const time = latin(form.time);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "TIME" };
  return { ok: true, body: { time: time || null, note: text(form.note, form.note_text) ?? null } };
}

/** What the app's refusals mean, in words Afkar's team can act on. */
export const NUTRITION_ERRORS: Record<string, string> = {
  NAME: "اكتبي الاسم بالعربي.",
  VALUES: "القيم لكل 100 غ غير معقولة — راجعي السعرات والبروتين والكربوهيدرات والدهون.",
  PORTION: "حصة ناقصة: اكتبي اسمها ووزنها بالغرام.",
  TIME: "الوقت بصيغة 08:00.",
  EMPTY: "أضيفي خانة واحدة على الأقل.",
  FOOD: "اختاري الطعام والحصة في كل خانة.",
  QTY: "كمية ناقصة أو غير معقولة.",
  KEY: "الرمز بالإنجليزية الصغيرة وأرقام وشرطات فقط، مثل clean-week.",
  LENGTH: "عدد الأيام غير صالح.",
  WEIGH_IN: "يوم الوزن يجب أن يكون داخل أيام المسار.",
  GOALS: "الأهداف أرقام صحيحة ومعقولة.",
  DAY: "لكل يوم وجبة واحدة على الأقل.",
  ALT_QTY_REQUIRED: "لا يمكن حساب كمية أحد البدائل تلقائياً — اكتبيها يدوياً.",
  DRAFT_FOOD: "أحد الأطعمة مسودة لم تُعتمد بعد.",
  PORTION_MISMATCH: "الحصة لا تتبع هذا الطعام.",
  UNKNOWN_FOOD: "طعام غير موجود في المكتبة.",
  UNKNOWN_TEMPLATE: "قالب وجبة غير موجود.",
  KEY_TAKEN: "هذا الرمز مستعمل لمسار آخر.",
  TEEN_NOT_ALLOWED: "مسار المراهقات بلا أهداف.",
  FORBIDDEN: "هذا ليس من صلاحيتك.",
  NOT_FOUND: "لم يعد موجوداً — حدّثي الصفحة.",
  UNREACHABLE: "التطبيق لا يرد الآن."
};
export const nutritionError = (code: unknown, fallback = "لم يُحفظ — حاولي مرة أخرى.") => NUTRITION_ERRORS[String(code)] ?? fallback;
