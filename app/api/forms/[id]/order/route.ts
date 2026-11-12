import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { setSubmissionOrder } from "@/app/lib/forms/store";

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
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };

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
