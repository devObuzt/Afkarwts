import { addMembersToGroup, createMember, findMemberByPhone, getDb, removeMemberFromGroup } from "../db";
import { getForm, getSubmission, phoneIsUsable, setSubmissionState } from "./store";

/**
 * A registration becomes a member of the cohort only when someone says so.
 * The link is public and members.phone is UNIQUE, so the two ways this can go
 * wrong are a stranger walking into a running journey, and a returning
 * participant having their record overwritten by whatever they typed this
 * time. Both are decided here, in the open.
 */
export function approveSubmission(id: number, options: { overwrite?: boolean } = {}) {
  const stored = getSubmission(id);
  if (!stored) {
    return { ok: false as const, error: "هذا التسجيل غير موجود." };
  }

  const { submission } = stored;
  const form = getForm(submission.formId);
  if (!form) {
    return { ok: false as const, error: "النموذج المرتبط بهذا التسجيل محذوف." };
  }

  if (!submission.phone) {
    return { ok: false as const, error: "لا يوجد رقم هاتف في هذا التسجيل، فلا يمكن إضافته كمنتسب." };
  }

  // Registrations taken before the form enforced a minimum are still in the
  // queue, and createMember throws on them. A throw here reaches the screen
  // as «Request failed (500)» and says nothing about what to do.
  if (!phoneIsUsable(submission.phone)) {
    return {
      ok: false as const,
      error: `رقم الهاتف «${submission.phone}» أقصر من أن يكون رقم واتساب. صحّح الرقم أو ارفض التسجيل.`
    };
  }

  const existing = findMemberByPhone(submission.phone);
  let memberId: number;
  let created = false;

  if (existing) {
    memberId = existing.id;
    if (options.overwrite) {
      updateMemberDetails(existing.id, { name: submission.name, city: submission.city });
    }
  } else {
    let member;
    try {
      member = createMember({
        name: submission.name || submission.phone,
        phone: submission.phone,
        city: submission.city
      });
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "تعذّر إنشاء المنتسب."
      };
    }
    if (!member) {
      return { ok: false as const, error: "تعذّر إنشاء المنتسب." };
    }
    memberId = member.id;
    created = true;
  }

  // INSERT OR IGNORE, so approving twice adds nobody twice.
  addMembersToGroup(form.groupId, [memberId]);
  setSubmissionState(id, "added", memberId);

  return { ok: true as const, memberId, created };
}

export function rejectSubmission(id: number) {
  setSubmissionState(id, "rejected", null);
}

/**
 * Undo a rejection: the registration goes back to waiting, not into the
 * group. A wrong reject is a mistake someone makes on a crowded table,
 * and the way back has to be one button — but it lands where it started,
 * so letting her in stays its own decision with its own record.
 */
export function restoreSubmission(id: number) {
  const stored = getSubmission(id);
  if (!stored) {
    return { ok: false as const, error: "هذا التسجيل غير موجود." };
  }
  if (stored.submission.state !== "rejected") {
    return { ok: false as const, error: "هذا التسجيل غير مرفوض." };
  }
  setSubmissionState(id, "new", null);
  return { ok: true as const };
}

/**
 * Erase a registration for good.
 *
 * Reject hides; this removes. It is for the rows that should never have
 * been counted — a staff member who filled the form to see what it looks
 * like — so leaving them marked «مرفوض» in a view would still be wrong.
 *
 * Deleting the registration is not enough on its own: once she was let
 * into the cohort she is a منتسبة in the path's group, and the journey
 * keeps writing to her. So she comes out of **this form's group** too, and
 * the next sync marks her enrolment removed and closes her follow-ups.
 *
 * What is deliberately left standing is her منتسبة record and her
 * messages. She may be a real person the clinic knows for other reasons —
 * staff, most of all — and a registration is not a reason to erase a
 * person. Deleting her outright is its own action on her own page.
 */
export function deleteSubmission(id: number) {
  const stored = getSubmission(id);
  if (!stored) {
    return { ok: false as const, error: "هذا التسجيل غير موجود." };
  }

  const { submission } = stored;
  const form = getForm(submission.formId);
  const db = getDb();

  // The member comes out of the cohort only when nothing else of hers on
  // this form still says she belongs in it. A woman who registered twice
  // and had both approved must not be dropped by deleting one of them.
  let leftGroup = false;
  const memberId = submission.memberId;
  if (memberId !== null && form) {
    const others = db
      .prepare(
        `SELECT COUNT(*) AS n FROM form_submissions
          WHERE form_id = ? AND id <> ? AND member_id = ? AND state = 'added'`
      )
      .get(submission.formId, id, memberId) as { n: number };
    if (Number(others?.n ?? 0) === 0) {
      removeMemberFromGroup(form.groupId, memberId);
      leftGroup = true;
    }
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM form_answers WHERE submission_id = ?").run(id);
    db.prepare("DELETE FROM form_submissions WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { ok: true as const, name: submission.name, phone: submission.phone, leftGroup };
}

/**
 * Only the fields a registration can speak for. The phone is deliberately not
 * among them: it is the key the member was found by, and changing it here
 * would collide with another member's record.
 */
function updateMemberDetails(memberId: number, patch: { name?: string; city?: string }) {
  const db = getDb();
  const current = db.prepare("SELECT name, city FROM members WHERE id = ?").get(memberId) as
    | { name: string; city: string }
    | undefined;
  if (!current) {
    return;
  }

  db.prepare("UPDATE members SET name = ?, city = ? WHERE id = ?").run(
    patch.name?.trim() || current.name,
    patch.city?.trim() || current.city,
    memberId
  );
}
