import { addMembersToGroup, createMember, findMemberByPhone, getDb } from "../db";
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
