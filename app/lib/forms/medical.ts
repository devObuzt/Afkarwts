import { getDb } from "../db";
import { setNote } from "./notes";

/**
 * الملاحظة الطبية، مستخلَصة من إجابات الاستمارة نفسها.
 *
 * 🔑 **بس اللي موجود بينكتب.** «مش حامل» و«بلا حساسية» و«ما بتاخد أدوية»
 * ما بينكتبوا — خانة فاضية معناها «ما في إشي ينتبهله»، وهيك العين بتلقط
 * اللي بدّه انتباه من مسافة. لو كتبنا النفي كمان، كل صف بيصير مليان نص
 * والمهم بيضيع جوّاته.
 *
 * والمطابقة **بنص السؤال** مش برقم الحقل: الأسئلة بتنحفظ مع كل إجابة
 * وقت الإرسال، فنص السؤال هو الإشي الثابت عبر النسخ المختلفة للاستمارة.
 */

/** أسئلة الاستمارة، بنصّها كما هو بـ`clean-template.ts`. */
const Q = {
  diseasesYesNo: "هل تعاني/ن من أمراض معينة؟",
  medsYesNo: "هل تتلقى/ين علاجاً معيناً أو تتناول/ين الأدوية؟",
  medsText: "ما هي الأدوية أو العلاجات؟",
  diseaseList: "هل تعاني/ين أو عانيت في السابق من أحد هذه الأمراض؟",
  diseaseOther: "شو هو المرض أو الحالة؟",
  pregnant: "هل أنت حامل؟",
  nursing: "هل أنت مرضعة؟",
  allergyYesNo: "هل لديك حساسية من أنواع أكل معينة؟",
  allergyText: "من أي أنواع أكل؟"
} as const;

/** «لا توجد لدي أمراض» بتنشال — وبتيجي أحياناً مع مرض محدّد بنفس الجواب. */
const NO_DISEASE = "لا توجد لدي أمراض";
/** خيار بيحوّل الجواب للمربّع النصّي اللي بعده. */
const OTHER = "آخر";

export type Answer = { label: string; value: string };

function find(answers: Answer[], needle: string) {
  // «بيحتوي» مش «بيساوي»: نصوص الأسئلة طويلة وفيها ترقيم وعلامات،
  // والسؤال بينحفظ كما هو وقت الإرسال فممكن يختلف بحرف بين نسخة ونسخة.
  return (answers.find((answer) => answer.label.includes(needle))?.value ?? "").trim();
}

function isYes(value: string) {
  return value.startsWith("نعم");
}

export function medicalSummary(answers: Answer[]) {
  const parts: string[] = [];

  if (isYes(find(answers, Q.pregnant))) {
    parts.push("حامل");
  }

  const nursing = find(answers, Q.nursing);
  if (isYes(nursing)) {
    // «نعم رضاعة كاملة» بتنكتب «مرضعة — رضاعة كاملة».
    parts.push(`مرضعة — ${nursing.replace(/^نعم\s*/, "").trim() || "بلا تفصيل"}`);
  }

  if (isYes(find(answers, Q.allergyYesNo))) {
    const what = find(answers, Q.allergyText);
    parts.push(what ? `حساسية: ${what}` : "حساسية (بلا تفصيل)");
  }

  const listed = find(answers, Q.diseaseList)
    .split("،")
    .map((item) => item.trim())
    .filter((item) => item && item !== NO_DISEASE);
  const other = find(answers, Q.diseaseOther);
  const diseases = listed.map((item) => (item === OTHER ? other || OTHER : item));

  if (diseases.length) {
    parts.push(`أمراض: ${diseases.join("، ")}`);
  } else if (isYes(find(answers, Q.diseasesYesNo))) {
    // قالت «بعاني من أمراض» وما علّمت ولا مرض. ما منبلعها بصمت:
    // الخانة الفاضية معناها «ما في إشي»، وهاي مش «ما في إشي».
    parts.push("أمراض: نعم (بلا تفصيل)");
  }

  if (isYes(find(answers, Q.medsYesNo))) {
    const what = find(answers, Q.medsText);
    parts.push(what ? `أدوية: ${what}` : "أدوية: نعم (بلا تفصيل)");
  }

  return parts.join(" · ");
}

/**
 * بتعبّي الخانة الطبية للتسجيلات اللي **ما فيها إشي مكتوب**.
 *
 * 🔴 **ولا مرة بتكتب فوق نص كتبه إنسان.** الخانة قابلة للتعديل، والتعديل
 * قرار حدا أخذه وهو شايف الاستمارة — تشغيلة تانية لهاي بتمرق من جنبه.
 * واللي بيمحي الخانة بتنمحى الصف، فبترجع تنعبّى بالتشغيلة الجاية: محو
 * الخانة معناه «ارجع للاستمارة»، والتعديل معناه «خلّيك عندي».
 */
export function fillMedicalNoteFor(submissionId: number) {
  const db = getDb();
  const taken = db
    .prepare("SELECT 1 FROM submission_notes WHERE submission_id = ? AND key = 'medical'")
    .get(submissionId);
  if (taken) {
    return false;
  }

  const answers = db
    .prepare("SELECT label, value FROM form_answers WHERE submission_id = ?")
    .all(submissionId) as Answer[];
  const text = medicalSummary(answers);
  if (!text) {
    return false;
  }

  setNote(submissionId, "medical", text);
  return true;
}

/**
 * نفس الإشي لكل تسجيلات استمارة.
 *
 * 🔴 **بتنكبس من ورا تسجيل دخول بس.** مسار إرسال الاستمارة عام — أي حدا
 * بيقدر يبعتله — فلو ناداها هو، كل إرسالية وحدة بتصير مسح لكل تسجيلات
 * الاستمارة وقراءة إجاباتهن كلها. استمارة فيها ألوف بتتحوّل لمضخّة شغل
 * بكبسة من برا. التسجيل الجديد بياخد `fillMedicalNoteFor` لحاله.
 */
export function fillMedicalNotes(formId?: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id FROM form_submissions s
        WHERE (? IS NULL OR s.form_id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM submission_notes n
             WHERE n.submission_id = s.id AND n.key = 'medical'
          )`
    )
    .all(formId ?? null, formId ?? null) as Array<{ id: number }>;

  let filled = 0;
  for (const row of rows) {
    const answers = db
      .prepare("SELECT label, value FROM form_answers WHERE submission_id = ?")
      .all(row.id) as Answer[];
    const text = medicalSummary(answers);
    if (!text) {
      continue;
    }
    setNote(row.id, "medical", text);
    filled += 1;
  }

  return { scanned: rows.length, filled };
}
