import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { recordAction } from "@/app/lib/users/audit";
import { getSubmission, phoneIsUsable, updateSubmissionAnswers } from "@/app/lib/forms/store";

export const runtime = "nodejs";

/**
 * Correcting a registration somebody already sent.
 *
 * Two permissions, not one. `forms.manage` because it is form data, and
 * `people.health` because a registration *is* the medical answers — the
 * illnesses, the medication, the pregnancy. Being allowed to edit a form's
 * questions is not being allowed to read, let alone rewrite, what a woman
 * answered about her body.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("forms.manage");
  if (!auth.ok) {
    return auth.response;
  }

  if (!can(auth.user, "people.health")) {
    return NextResponse.json(
      { error: "تعديل التسجيل يحتاج صلاحية «عرض الإجابات الصحية» أيضاً: التسجيل هو الملف الطبي." },
      { status: 403 }
    );
  }

  const id = Number((await params).id);
  const body = (await request.json()) as { edits?: Array<{ answerId?: number; value?: string }> };
  const edits = (body.edits ?? [])
    .filter((edit) => Number.isFinite(Number(edit.answerId)))
    .map((edit) => ({ answerId: Number(edit.answerId), value: String(edit.value ?? "") }));

  if (edits.length === 0) {
    return NextResponse.json({ error: "لا تعديل." }, { status: 400 });
  }

  try {
    const { changed } = updateSubmissionAnswers(id, edits);
    const after = getSubmission(id);

    if (changed.length > 0) {
      recordAction({
        userId: auth.user.id,
        actor: auth.user.name,
        action: "lead.edit",
        subjectType: "submission",
        subjectId: id,
        subjectLabel: after?.submission.name || `#${id}`,
        // The questions that changed, never the answers. The audit log is
        // read by anyone with «إدارة المستخدمين», and writing «حامل: نعم»
        // into it would hand a health answer to someone who is not allowed
        // to open the person's file.
        detail: `عُدّلت الإجابات: ${changed.join("، ")}`
      });
    }

    const phone = after?.submission.phone ?? "";
    return NextResponse.json({
      ok: true,
      changed,
      submission: after?.submission,
      // Said rather than enforced: a half-typed phone is a reason to warn,
      // not a reason to refuse the rest of the correction.
      phoneWarning: phone && !phoneIsUsable(phone) ? "الرقم ما زال قصيراً ولن يقبله «أضف للمجموعة»." : ""
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ التعديل." },
      { status: 400 }
    );
  }
}
