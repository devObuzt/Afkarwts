import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { clearSubmissionOrder, setSubmissionOrder, submissionTowns } from "@/app/lib/forms/store";
import { officialOrder } from "@/app/lib/forms/regions";

export const runtime = "nodejs";

/** سقف معقول: أكبر استمارة عنا أقل من ألف بكتير، وبيمنع حمولة ضخمة. */
const MAX_ROWS = 5000;

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

  // الترتيب الرسمي: بينحسب على السيرفر من البلاد، مش بينبعت من الشاشة.
  // الشاشة بتعرض اللي انرتّب، فلو كانت هي مصدر الترتيب كمان بنكون
  // عم نصدّق نفسنا.
  if (body.official) {
    const plan = officialOrder(submissionTowns(formId));
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
