import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function cohort(name: string) {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`${name} ${seq}`);
  return { group, form: createForm({ name: `${name} ${seq}`, groupId: group.id, fromTemplate: true }) };
}

/** Fills the whole form, with the three mapped answers set by the caller. */
async function register(
  form: { id: number; token: string },
  who: { name: string; phone: string; city?: string }
) {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};

  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? who.name
        : field.mapsTo === "phone"
          ? who.phone
          : field.mapsTo === "city"
            ? who.city ?? "—"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }

  const result = submitForm(form.token, answers);
  assert.equal(result.ok, true, "the registration itself should succeed");
  return (result as { id: number }).id;
}

test("approving an unknown phone creates the member and puts them in the cohort", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { findMemberByPhone, listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين جديد");
  const id = await register(form, { name: "سارة عوض", phone: "0545227674", city: "مجد الكروم" });

  const result = approveSubmission(id) as { ok: true; memberId: number; created: boolean };
  assert.equal(result.ok, true);
  assert.equal(result.created, true);

  const member = findMemberByPhone("+972545227674")!;
  assert.equal(member.name, "سارة عوض");
  assert.equal(member.city, "مجد الكروم");
  assert.equal(
    listGroupMembers(group.id).some((item) => item.id === member.id),
    true
  );
});

test("a returning member keeps their details unless we ask to change them", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { createMember, findMemberByPhone, listGroupMembers } = await import("@/app/lib/db");
  createMember({ name: "سارة القديمة", phone: "+972545227675", city: "عكا" });

  const { form, group } = await cohort("كلين راجع");
  const id = await register(form, { name: "سارة الجديدة", phone: "0545227675", city: "حيفا" });

  const result = approveSubmission(id) as { ok: true; memberId: number; created: boolean };
  assert.equal(result.created, false);
  assert.equal(findMemberByPhone("+972545227675")!.name, "سارة القديمة", "not overwritten");
  assert.equal(listGroupMembers(group.id).length, 1, "but they are in the cohort either way");
});

test("asking to update does change the returning member's details", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { createMember, findMemberByPhone } = await import("@/app/lib/db");
  createMember({ name: "ورود القديمة", phone: "+972545227676", city: "عكا" });

  const { form } = await cohort("كلين تحديث");
  const id = await register(form, { name: "ورود الطويل", phone: "0545227676", city: "سخنين" });
  approveSubmission(id, { overwrite: true });

  const member = findMemberByPhone("+972545227676")!;
  assert.equal(member.name, "ورود الطويل");
  assert.equal(member.city, "سخنين");
});

test("the lead carries a warning when the phone is already a member", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { getSubmission } = await import("@/app/lib/forms/store");
  createMember({ name: "أمون أبو دياب", phone: "+972528751511", city: "" });

  const { form } = await cohort("كلين معروف");
  const id = await register(form, { name: "أمون", phone: "0528751511" });

  assert.equal(getSubmission(id)!.submission.knownMemberName, "أمون أبو دياب");
});

test("approving twice does not add the member twice", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين مرتين");
  const id = await register(form, { name: "أمون", phone: "0545227677" });

  approveSubmission(id);
  approveSubmission(id);
  assert.equal(listGroupMembers(group.id).length, 1);
});

test("a registration with no usable phone cannot be approved", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين بلا رقم");

  // A form whose phone question was removed — the lead is kept, but there is
  // nobody to create.
  const { archiveField } = await import("@/app/lib/forms/store");
  for (const field of listFields(form.id)) {
    if (field.mapsTo === "phone") {
      archiveField(field.id);
    }
  }

  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name" ? "بلا رقم" : field.kind === "date" ? "2026-10-02" : field.options.length ? field.options[0] : "نعم";
  }
  const submitted = submitForm(form.token, answers) as { ok: true; id: number };

  const result = approveSubmission(submitted.id);
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /رقم/);
});

test("a rejected lead is kept, not deleted", async () => {
  const { rejectSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين مرفوض");
  const id = await register(form, { name: "تجربة", phone: "0500000001" });

  rejectSubmission(id);
  assert.equal(getSubmission(id)!.submission.state, "rejected");
});

test("approving a rejected lead is still possible — rejection is not a dead end", async () => {
  const { rejectSubmission, approveSubmission } = await import("@/app/lib/forms/approve");
  const { listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين تراجع");
  const id = await register(form, { name: "رجعت", phone: "0500000002" });

  rejectSubmission(id);
  const result = approveSubmission(id);
  assert.equal(result.ok, true);
  assert.equal(listGroupMembers(group.id).length, 1);
});
