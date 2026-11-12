import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { clearSubmissionOrder, setSubmissionOrder, submissionsForOrdering } from "@/app/lib/forms/store";
import { officialOrder } from "@/app/lib/forms/regions";

export const runtime = "nodejs";

/** سقف معقول: أكبر استمارة عنا أقل من ألف بكتير، وبيمنع حمولة ضخمة. */
const MAX_ROWS = 5000;

/** الأعمدة اللي بتنرتّب أبجدياً — قائمة مسمّاة، مش أي إشي بيوصل. */
const SORTABLE = new Set(["name", "hebrewName", "city"]);

/**
 * ترتيب سطور التقرير بالسحب.
 *
 * `forms.manage` زي أي تعديل على الاستمارة. الترتيب مش بيانات منتسبة —
 * هو ترتيب ورقة شغل — فما بدّه صلاحية الإجابات الصحية.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("forms.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const formId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    official?: boolean;
    reset?: boolean;
    sortBy?: unknown;
    dir?: unknown;
  };

  // رجوع للترتيب الأصلي: بتنشال الأرقام، فبيرجع ترتيب تاريخ التسجيل.
  if (body.reset) {
    clearSubmissionOrder(formId);
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "lead.edit",
      subjectType: "submission",
      subjectId: 0,
      subjectLabel: `استمارة #${formId}`,
      detail: "انشال الترتيب اليدوي — رجعت لترتيب التسجيل"
    });
    return NextResponse.json({ ok: true, reset: true });
  }

  // ترتيب أبجدي على عمود.
  //
  // 🔑 **بينحفظ زي أي ترتيب تاني**، مش عرض مؤقت: لو كان مؤقت بتصير
  // الشاشة تعرض إشي وExcel وPDF إشي تاني — وهاد بالضبط اللي كسر
  // السحب أول مرة.
  if (body.sortBy) {
    const by = String(body.sortBy);
    if (!SORTABLE.has(by)) {
      return NextResponse.json({ error: "عمود ما بينرتّب." }, { status: 400 });
    }
    const down = body.dir === "desc";
    const rows = submissionsForOrdering(formId);
    // الترتيب الأبجدي بلغة العمود: العربي بترتيبه والعبري بترتيبه.
    // `sensitivity: base` بتخلّي الهمزة والألف والتاء المربوطة يقعدوا
    // جنب بعض بدل ما تتفرّق الأسماء على آخر الجدول.
    const collator = new Intl.Collator(by === "hebrewName" ? "he" : "ar", {
      numeric: true,
      sensitivity: "base"
    });
    const keyOf = (row: (typeof rows)[number]) =>
      by === "name"
        ? row.name || row.hebrewName
        : by === "hebrewName"
          ? row.hebrewName || row.name
          : row.hebrewCity || row.city;

    const ordered = rows
      .map((row, at) => ({ row, at, key: (keyOf(row) ?? "").trim() }))
      .sort((a, b) => {
        // الفاضي بالآخر دايماً، بالاتجاهين: «بلا اسم» مش أول الأبجدية
        // ولا آخرها، هو نقص بيانات ومحلّه تحت.
        if (!a.key !== !b.key) {
          return a.key ? -1 : 1;
        }
        const cmp = collator.compare(a.key, b.key);
        return (down ? -cmp : cmp) || a.at - b.at;
      })
      .map((item) => item.row.id);

    setSubmissionOrder(formId, ordered);
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "lead.edit",
      subjectType: "submission",
      subjectId: 0,
      subjectLabel: `استمارة #${formId}`,
      detail: `ترتيب أبجدي على «${by}» ${down ? "نازل" : "طالع"}`
    });
    return NextResponse.json({ ok: true, sorted: ordered.length });
  }

  // الترتيب الرسمي: بينحسب على السيرفر من البلاد، مش بينبعت من الشاشة.
  // الشاشة بتعرض اللي انرتّب، فلو كانت هي مصدر الترتيب كمان بنكون
  // عم نصدّق نفسنا.
  if (body.official) {
    const plan = officialOrder(submissionsForOrdering(formId));
    setSubmissionOrder(formId, plan.ids);
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "lead.edit",
      subjectType: "submission",
      subjectId: 0,
      subjectLabel: `استمارة #${formId}`,
      detail: `ترتيب رسمي حسب البلاد (${plan.placed} سطر · ${plan.unplaced} بلا منطقة)`
    });
    return NextResponse.json({ ok: true, ...plan });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > MAX_ROWS) {
    return NextResponse.json({ error: "القائمة مش مفهومة." }, { status: 400 });
  }

  const ids = body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length !== body.ids.length) {
    return NextResponse.json({ error: "القائمة مش مفهومة." }, { status: 400 });
  }

  const result = setSubmissionOrder(formId, ids);

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "lead.edit",
    subjectType: "submission",
    subjectId: 0,
    subjectLabel: `استمارة #${formId}`,
    detail: `انرتّبت سطور التقرير بالإيد (${result.ordered} سطر)`
  });

  return NextResponse.json({ ok: true, ...result });
}
