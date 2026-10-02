export type FieldKind =
  | "text"
  | "textarea"
  | "phone"
  | "date"
  | "choice"
  | "multi"
  | "consent"
  | "town"
  | "signature";

export type NewField = {
  label: string;
  help?: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  /** Fills a member field when the lead is approved: name, phone or city. */
  mapsTo?: "" | "name" | "phone" | "city";
  /**
   * Shown only when another question was answered a certain way. Referenced by
   * the question's position in this list, since ids do not exist until the
   * form is created — see resolveTemplateConditions.
   */
  showWhenIndex?: number;
  showWhenValue?: string;
  showWhenFieldId?: number | null;
};

/**
 * Afkar's Clean intake, as it reads on the Google form a cohort fills today.
 * A new form starts from this and is edited per cohort; the wording is hers,
 * not ours, so it is copied rather than rewritten.
 */
export const CLEAN_TEMPLATE: NewField[] = [
  { label: "الاسم الكامل", kind: "text", required: true, mapsTo: "name" },
  { label: "البلد", kind: "town", required: true, mapsTo: "city" },
  {
    label: "العنوان بالتفصيل",
    help: "لتوصيل العصائر يوم الثلاثاء: المنطقة، الضاحية، الشارع ورقم البيت. مثال: الماصيون - عين منجد - شارع 12",
    kind: "textarea",
    required: true
  },
  { label: "رقم الهاتف", kind: "phone", required: true, mapsTo: "phone" },
  { label: "رقم الهوية", kind: "text", required: false },
  {
    label: "تاريخ الميلاد",
    help: "مهم جداً للحصول على مكافآت في يوم ميلادك",
    kind: "date",
    required: true
  },
  { label: "هل تعاني/ن من أمراض معينة؟", kind: "choice", required: true, options: ["نعم", "لا"] },
  { label: "هل تتلقى/ين علاجاً معيناً أو تتناول/ين الأدوية؟", kind: "choice", required: true, options: ["نعم", "لا"] },
  {
    label: "ما هي الأدوية أو العلاجات؟ وكم مرة باليوم أو بالأسبوع؟ وشو هدف العلاج؟",
    kind: "textarea",
    required: true,
    showWhenIndex: 7,
    showWhenValue: "نعم"
  },
  {
    label: "هل تعاني/ين أو عانيت في السابق من أحد هذه الأمراض؟",
    kind: "multi",
    required: true,
    options: [
      "مشاكل الغدة الدرقية",
      "سكتة قلبية",
      "فشل كلوي",
      "التهاب القولون - كوليتس",
      "كرون",
      "أمراض في الأمعاء",
      "مشاكل البطن الحادة",
      "صرع - ابليبسيا",
      "سكري",
      "لا توجد لدي أمراض"
    ]
  },
  { label: "للنساء - هل أنت حامل؟", kind: "choice", required: true, options: ["نعم", "لا"] },
  {
    label: "للنساء - هل أنت مرضعة؟",
    kind: "choice",
    required: true,
    options: ["نعم رضاعة كاملة", "نعم رضاعة جزئية", "لا"]
  },
  {
    label: "هل لديك حساسية من أنواع أكل معينة؟",
    help: "هام لإنتاج العصائر فقط",
    kind: "choice",
    required: true,
    options: ["نعم", "لا"]
  },
  {
    label: "من أي أنواع أكل؟",
    help: "هام لإنتاج العصائر فقط",
    kind: "textarea",
    required: true,
    showWhenIndex: 12,
    showWhenValue: "نعم"
  },
  {
    label:
      "أوافق على أن إجاباتي صحيحة وسليمة وأنني لم أخفِ أي معلومة صحية تخصني، وأصرّح أنه ليس معلوماً لي عن أي مشكلة تمنعني من المشاركة في برنامج تنظيف السموم",
    kind: "consent",
    required: true,
    options: ["موافق/ة"]
  },
  {
    label:
      "أوافق على أن كل التعليمات التي أحصل عليها من السيدة أفكار ليست بديلاً عن الاستشارة الطبية، ولا تلزمني بوقف علاجات طبية — وهذا يحصل فقط باستشارة الطبيب الخاص",
    kind: "consent",
    required: true,
    options: ["موافق/ة"]
  },
  {
    label:
      "رزمة قناني العصائر تُوزَّع يوم الثلاثاء خلال أسبوع Clean عبر خدمة التوصيل، لذلك عليك أن تكون متاحاً للتواصل في هذا اليوم لأننا لا نعلم مسبقاً متى يصل عامل التوصيل",
    kind: "consent",
    required: true,
    options: ["أنا موافق/ة"]
  },
  {
    label:
      "١) إمكانية إلغاء الاشتراك حتى يوم الثلاثاء ما قبل بداية أسبوع Clean، مع استرجاع كامل للمبلغ أو تأجيل الاشتراك للمرة القادمة. ٢) في حال إلغاء الاشتراك بعد الموعد المحدد لا يوجد استرجاع للمبلغ، ولا يمكن تأجيل الاشتراك",
    kind: "consent",
    required: true,
    options: ["أنا موافق/ة"]
  },
  { label: "التوقيع", help: "وقّع/ي بإصبعك داخل المربع", kind: "signature", required: true }
];

export const CLEAN_INTRO =
  "هدف الاستمارة هو معرفة التفاصيل وتقييم حالة المشترك من أجل بناء برنامج ملائم.";

/**
 * {{year}} is filled in when the page renders, not when the form is created —
 * a form made in December for a January cohort should not carry last year.
 */
export const CLEAN_TITLE = "CLEAN - اسبوع كلين تنظيف السموم {{year}}";

export function renderTitle(title: string, now = new Date()) {
  return title.split("{{year}}").join(String(now.getFullYear()));
}
