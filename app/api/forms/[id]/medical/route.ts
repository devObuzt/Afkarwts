import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { recordAction } from "@/app/lib/users/audit";
import { fillMedicalNotes } from "@/app/lib/forms/medical";

export const runtime = "nodejs";

/**
 * تعبئة «ملاحظات طبية» من إجابات الاستمارة.
 *
 * نفس صلاحيتَي تعديل التسجيل: `forms.manage` لأنها بيانات استمارة،
 * و`people.health` لأنّ اللي بينكتب بالخانة **هو** الجواب الطبي —
 * حمل، حساسية، أمراض، أدوية. مين مش مخوّل يقراهن مش مخوّل ينسخهن
 * لعمود بينقرا بنظرة.
 *
 * بتعبّي الفاضي بس — تعديل كتبه إنسان ما بينلمس.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("forms.manage");
  if (!auth.ok) {
    return auth.response;
  }

  if (!can(auth.user, "people.health")) {
    return NextResponse.json(
      { error: "تعبئة الملاحظات الطبية تحتاج صلاحية «عرض الإجابات الصحية»." },
      { status: 403 }
    );
  }

  const formId = Number((await params).id);
  const result = fillMedicalNotes(formId);

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "lead.edit",
    subjectType: "submission",
    subjectId: 0,
    subjectLabel: `استمارة #${formId}`,
    // العدد بس — ولا جواب طبي بينكتب بسجلّ التدقيق.
    detail: `عُبّئت «ملاحظات طبية» من الاستمارة لـ${result.filled} تسجيل`
  });

  return NextResponse.json({ ok: true, ...result });
}
