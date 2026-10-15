import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { recordAction } from "@/app/lib/users/audit";
import {
  getSubmission,
  phoneIsUsable,
  setHebrewFields,
  updateSubmissionAnswers
} from "@/app/lib/forms/store";
import { deleteSubmission } from "@/app/lib/forms/approve";
import { setNote } from "@/app/lib/forms/notes";

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
  const body = (await request.json()) as {
    edits?: Array<{ answerId?: number; value?: string }>;
    hebrew?: { name?: string; city?: string };
    note?: { key?: string; value?: string };
  };

  // Afkar's own columns. Not an answer she gave, so it never touches the
  // form — but it sits on her registration, so it is gated the same.
  if (body.note) {
    const saved = setNote(id, String(body.note.key ?? ""), String(body.note.value ?? ""));
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "lead.edit",
      subjectType: "submission",
      subjectId: id,
      subjectLabel: getSubmission(id)?.submission.name || `#${id}`,
      // The column's name, never what was written in it.
      detail: `عمود «${body.note.key}»`
    });
    return NextResponse.json({ ok: true, note: true });
  }

  // The Hebrew name and town are ours, not hers: they are not an answer
  // she gave, so they are saved on their own and never touch the form.
  if (body.hebrew) {
    try {
      const saved = setHebrewFields(id, body.hebrew);
      recordAction({
        userId: auth.user.id,
        actor: auth.user.name,
        action: "lead.edit",
        subjectType: "submission",
        subjectId: id,
        subjectLabel: getSubmission(id)?.submission.name || `#${id}`,
        detail: `أُكّد ${saved.join("، ")}`
      });
      return NextResponse.json({ ok: true, hebrew: true });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "تعذّر الحفظ." },
        { status: 400 }
      );
    }
  }
  const edits = (body.edits ?? [])
    .filter((edit) => Number.isFinite(Number(edit.answerId)))
    .map((edit) => ({ answerId: Number(edit.answerId), value: String(edit.value ?? "") }));

  if (edits.length === 0) {
    return NextResponse.json({ error: "لا تعديل." }, { status: 400 });
  }

  try {
    // Rewriting her name, town or number is editing a منتسبة. Without
    // that permission the registration is still corrected; her record is
    // left alone and the screen says so.
    const { changed, reached, phoneTaken, memberBlocked } = updateSubmissionAnswers(id, edits, {
      mayEditMember: can(auth.user, "people.edit")
    });
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
        detail:
          `عُدّلت الإجابات: ${changed.join("، ")}` +
          (reached.length ? ` · وتغيّر في ملفها: ${reached.join("، ")}` : "")
      });
    }

    const phone = after?.submission.phone ?? "";
    return NextResponse.json({
      ok: true,
      changed,
      submission: after?.submission,
      reached,
      // Said rather than enforced: a half-typed phone is a reason to warn,
      // not a reason to refuse the rest of the correction.
      memberBlocked,
      phoneWarning: memberBlocked
        ? "صُحّح التسجيل، وملف المنتسبة لم يتغيّر: تعديله يحتاج صلاحية «تعديل البيانات»."
        : phoneTaken
          ? "الرقم الجديد مسجّل باسم منتسبة أخرى، فلم يُغيَّر في ملفها. راجعي التكرار أولاً."
          : phone && !phoneIsUsable(phone)
            ? "الرقم ما زال قصيراً ولن يقبله «أضف للمجموعة»."
            : ""
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ التعديل." },
      { status: 400 }
    );
  }
}

/**
 * Erase a registration.
 *
 * Gated on `people.delete` — the one permission already described to its
 * holder as irreversible, and the one only the owner starts with. Rejecting
 * is the everyday tool and sits behind `leads.review`; this is not that.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.delete");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const before = getSubmission(id)?.submission;
  const result = deleteSubmission(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // The name, never the answers: the audit log is read by anyone holding
  // «إدارة المستخدمين», and a deleted registration is still her health file.
  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "lead.delete",
    subjectType: "submission",
    subjectId: id,
    subjectLabel: result.name || `#${id}`,
    detail: result.leftGroup ? "وأُخرجت من مجموعة المسار" : (before?.state === "added" ? "وبقيت بالمجموعة لتسجيل آخر" : "")
  });

  return NextResponse.json({ ok: true, leftGroup: result.leftGroup });
}
