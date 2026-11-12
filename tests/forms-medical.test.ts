import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

const Q = {
  diseasesYesNo: "هل تعاني/ن من أمراض معينة؟",
  medsYesNo: "هل تتلقى/ين علاجاً معيناً أو تتناول/ين الأدوية؟",
  medsText: "ما هي الأدوية أو العلاجات؟ وكم مرة باليوم أو بالأسبوع؟ وشو هدف العلاج؟",
  diseaseList: "هل تعاني/ين أو عانيت في السابق من أحد هذه الأمراض؟",
  diseaseOther: "شو هو المرض أو الحالة؟",
  pregnant: "للنساء - هل أنت حامل؟",
  nursing: "للنساء - هل أنت مرضعة؟",
  allergyYesNo: "هل لديك حساسية من أنواع أكل معينة؟",
  allergyText: "من أي أنواع أكل؟"
};

function answers(values: Record<string, string>) {
  return Object.entries(values).map(([label, value]) => ({ label, value }));
}

test("ولا إشي بينكتب لما يكون كل الجواب «لا»", async () => {
  const { medicalSummary } = await import("@/app/lib/forms/medical");
  assert.equal(
    medicalSummary(
      answers({
        [Q.pregnant]: "لا",
        [Q.nursing]: "لا",
        [Q.allergyYesNo]: "لا",
        [Q.diseasesYesNo]: "لا",
        [Q.diseaseList]: "لا توجد لدي أمراض",
        [Q.medsYesNo]: "لا"
      })
    ),
    ""
  );
});

test("الموجب بس بينكتب، وبالترتيب", async () => {
  const { medicalSummary } = await import("@/app/lib/forms/medical");
  assert.equal(
    medicalSummary(
      answers({
        [Q.pregnant]: "نعم",
        [Q.nursing]: "نعم رضاعة جزئية",
        [Q.allergyYesNo]: "نعم",
        [Q.allergyText]: "مكسرات وحليب",
        [Q.diseaseList]: "سكري، مشاكل الغدة الدرقية",
        [Q.medsYesNo]: "نعم",
        [Q.medsText]: "الكتروكسين مرة باليوم"
      })
    ),
    "حامل · مرضعة — رضاعة جزئية · حساسية: مكسرات وحليب · أمراض: سكري، مشاكل الغدة الدرقية · أدوية: الكتروكسين مرة باليوم"
  );
});

test("«لا توجد لدي أمراض» بتنشال حتى لو إجت مع مرض محدّد", async () => {
  const { medicalSummary } = await import("@/app/lib/forms/medical");
  // جواب حقيقي من دفعة 15.11: علّمت «ما عندي أمراض» و«آخر» سوا.
  assert.equal(
    medicalSummary(
      answers({
        [Q.diseaseList]: "لا توجد لدي أمراض، آخر",
        [Q.diseaseOther]: "ضغط دم"
      })
    ),
    "أمراض: ضغط دم"
  );
});

test("«آخر» بتنستبدل بنصّها، و«نعم» بلا تفصيل ما بتنبلع بصمت", async () => {
  const { medicalSummary } = await import("@/app/lib/forms/medical");
  assert.equal(medicalSummary(answers({ [Q.diseaseList]: "آخر", [Q.diseaseOther]: "" })), "أمراض: آخر");
  assert.equal(
    medicalSummary(answers({ [Q.diseasesYesNo]: "نعم", [Q.diseaseList]: "لا توجد لدي أمراض" })),
    "أمراض: نعم (بلا تفصيل)"
  );
  assert.equal(medicalSummary(answers({ [Q.allergyYesNo]: "نعم" })), "حساسية (بلا تفصيل)");
});

test("التعبئة ما بتكتب فوق نص كتبه إنسان", async () => {
  const { fillMedicalNotes } = await import("@/app/lib/forms/medical");
  const { setNote, notesForForm } = await import("@/app/lib/forms/notes");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");

  const group = createGroup("طبي");
  const form = createForm({ name: "طبي", groupId: group.id, fromTemplate: true });
  const token = form.token;
  // كل سؤال إلزامي لازم ياخد قيمة، وإلا `submitForm` بترفض قبل ما
  // توصل للخانة الطبية أصلاً.
  const values: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    if (field.label.includes("الاسم الكامل")) values[String(field.id)] = "سارة";
    else if (field.label.includes("رقم الهاتف")) values[String(field.id)] = "0501112233";
    else if (field.label.includes("هل أنت حامل")) values[String(field.id)] = "نعم";
    else if (!field.required) continue;
    else if (field.options.length) values[String(field.id)] = field.options[field.options.length - 1];
    else values[String(field.id)] = "—";
  }
  const sent = submitForm(form.token, values, { requirePhoneCode: false });
  assert.equal(sent.ok, true);
  const id = sent.ok ? sent.id : 0;

  // انعبّت لحالها وقت التسجيل.
  assert.equal(notesForForm(form.id).get(id)?.medical, "حامل");

  setNote(id, "medical", "راجعناها — الحمل بشهره الأول");
  fillMedicalNotes(form.id);
  assert.equal(notesForForm(form.id).get(id)?.medical, "راجعناها — الحمل بشهره الأول");
});
