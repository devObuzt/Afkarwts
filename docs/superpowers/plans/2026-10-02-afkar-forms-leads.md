# Registration forms and leads — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A registration form per cohort with its own public link, whose submissions land as leads in HeartBeat and become members of the cohort's group with one click.

**Architecture:** Four additive SQLite tables behind one store module, mirroring how `app/lib/journeys/` is built. A public server-rendered page at `/f/<token>` posts to a public API route that validates against the database. Approval is a pure-ish store function the API wraps, so the member/group rules are tested without HTTP.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `node:sqlite` (`DatabaseSync`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-02-afkar-forms-leads-design.md`

## Global Constraints

- Tables are created with `CREATE TABLE IF NOT EXISTS` and columns added with the existing `addColumnIfMissing` helper — nothing existing is altered.
- Every test file calls `useTempDataDir()` from `tests/helpers/data-dir.ts` first.
- Phone values go through `normalizePhone` from `@/app/lib/db` before storage or lookup.
- Server validates; the browser's copy of the field list is a convenience only.
- UI copy is English (matching Journeys and Templates); form content is Arabic.
- `/f/` and `/api/f/` are added to `publicPrefixes` in `middleware.ts`.

---

## File structure

| File | Responsibility |
|---|---|
| `app/lib/forms/schema.ts` | The four tables, run from `getDb()` |
| `app/lib/forms/clean-template.ts` | The nineteen Clean questions as data |
| `app/lib/forms/store.ts` | Forms, fields, submissions, answers — reads and writes |
| `app/lib/forms/approve.ts` | Lead → member + group, including the known-phone rules |
| `app/api/f/[token]/route.ts` | Public submit |
| `app/api/forms/route.ts` | List and create forms |
| `app/api/forms/[id]/route.ts` | Rename, open/close, delete |
| `app/api/forms/[id]/fields/route.ts` | Add a field |
| `app/api/forms/fields/[fieldId]/route.ts` | Edit, remove, reorder a field |
| `app/api/leads/route.ts` | List submissions |
| `app/api/leads/[id]/route.ts` | Approve or reject one |
| `app/f/[token]/page.tsx` | The public form |
| `app/f/[token]/FormClient.tsx` | Its client-side fill-and-submit |
| `app/leads/page.tsx` | Leads and forms management |
| `app/components/AdminNav.tsx` | The shared menu |

---

## Task 1: Tables, Clean template, and the store

**Files:**
- Create: `app/lib/forms/schema.ts`, `app/lib/forms/clean-template.ts`, `app/lib/forms/store.ts`
- Modify: `app/lib/db.ts` (call `migrateFormTables` where `migrateJourneyTables` is called)
- Test: `tests/forms-store.test.ts`

**Interfaces:**
- Consumes: `getDb`, `normalizePhone` from `@/app/lib/db`
- Produces:
  - `migrateFormTables(db: DatabaseSync): void`
  - `CLEAN_TEMPLATE: NewField[]` where `NewField = { label, help?, kind, required, options?, mapsTo? }`
  - `createForm(input: { name: string; groupId: number; fromTemplate?: boolean }): Form`
  - `getFormByToken(token: string): Form | null`, `getForm(id: number): Form | null`, `listForms(): Form[]`
  - `setFormStatus(id: number, status: "open" | "closed"): void`
  - `listFields(formId: number): Field[]`
  - `addField(formId: number, field: NewField): Field`
  - `updateField(fieldId: number, patch: Partial<NewField>): Field`
  - `archiveField(fieldId: number): void`
  - `moveField(fieldId: number, direction: "up" | "down"): void`
  - `recordSubmission(formId: number, answers: Array<{ fieldId: number; value: string }>): number`
  - `listSubmissions(filter?: { formId?: number; state?: string }): SubmissionRow[]`
  - `getSubmission(id: number): { submission: SubmissionRow; answers: Array<{ label: string; value: string }> } | null`
  - `Form = { id, name, token, groupId, groupName, status, intro, submissionCount, createdAt }`
  - `Field = { id, formId, position, label, help, kind, required, options: string[], mapsTo }`
  - `SubmissionRow = { id, formId, formName, state, memberId, name, phone, submittedAt, knownMemberId: number | null }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/forms-store.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

async function cohort(name: string) {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm } = await import("@/app/lib/forms/store");
  const group = createGroup(name);
  return { group, form: createForm({ name, groupId: group.id, fromTemplate: true }) };
}

test("a new form starts from the Clean template and gets its own link", async () => {
  const { listFields } = await import("@/app/lib/forms/store");
  const { CLEAN_TEMPLATE } = await import("@/app/lib/forms/clean-template");
  const { form } = await cohort("كلين 18.10");

  assert.equal(form.status, "open");
  assert.match(form.token, /^[a-z0-9]{8,}$/);
  assert.equal(listFields(form.id).length, CLEAN_TEMPLATE.length);
  assert.equal(listFields(form.id)[0].mapsTo, "name", "the first question fills the member's name");
});

test("two forms never share a link", async () => {
  const a = await cohort("كلين 18.10");
  const b = await cohort("كلين 01.11");
  assert.notEqual(a.form.token, b.form.token);
});

test("an answer keeps the question it was answered against", async () => {
  const { listFields, recordSubmission, getSubmission, updateField } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين تسجيل");
  const fields = listFields(form.id);

  const id = recordSubmission(form.id, [{ fieldId: fields[0].id, value: "سارة عوض" }]);
  updateField(fields[0].id, { label: "الاسم الثلاثي" });

  const stored = getSubmission(id)!;
  assert.equal(stored.answers[0].label, "الاسم الكامل", "the old wording travels with the answer");
  assert.equal(stored.answers[0].value, "سارة عوض");
});

test("a removed question leaves its past answers readable", async () => {
  const { listFields, recordSubmission, getSubmission, archiveField } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين حذف");
  const fields = listFields(form.id);

  const id = recordSubmission(form.id, [{ fieldId: fields[0].id, value: "ورود" }]);
  archiveField(fields[0].id);

  assert.equal(listFields(form.id).some((f) => f.id === fields[0].id), false);
  assert.equal(getSubmission(id)!.answers.length, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test tests/forms-store.test.ts`
Expected: FAIL — `Cannot find module '@/app/lib/forms/store'`

- [ ] **Step 3: Write `schema.ts`**

Four tables exactly as the spec's data model lists them, plus:

```ts
CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id, position);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id, state);
CREATE INDEX IF NOT EXISTS idx_form_answers_submission ON form_answers(submission_id);
```

- [ ] **Step 4: Write `clean-template.ts`**

The nineteen questions from the Google form, in order, with `mapsTo` set on the name (`name`), phone (`phone`) and address (`city`) questions and empty elsewhere. Question text copied verbatim from the live form.

- [ ] **Step 5: Write `store.ts`**

`createForm` generates the token with `randomUUID().replace(/-/g, "").slice(0, 10)` and seeds the template when asked. `recordSubmission` writes `form_answers.label` from the field's current label. `listFields` excludes archived.

- [ ] **Step 6: Wire the migration**

In `app/lib/db.ts`, call `migrateFormTables(db)` beside `migrateJourneyTables(db)`.

- [ ] **Step 7: Run the tests**

Run: `npx tsx --test tests/forms-store.test.ts` — Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add app/lib/forms app/lib/db.ts tests/forms-store.test.ts
git commit -m "feat: forms, fields and submissions, with the Clean template"
```

---

## Task 2: Submitting — validation on the server

**Files:**
- Create: `app/api/f/[token]/route.ts`
- Modify: `middleware.ts` (add `/f` and `/api/f` to `publicPrefixes`)
- Test: `tests/forms-submit.test.ts`

**Interfaces:**
- Consumes: `getFormByToken`, `listFields`, `recordSubmission` from Task 1
- Produces: `submitForm(token: string, answers: Record<string, string>): { ok: true; id: number } | { ok: false; error: string }` exported from `app/lib/forms/store.ts` — the route is a thin wrapper so the rules are tested without HTTP.

- [ ] **Step 1: Write the failing test**

```ts
// tests/forms-submit.test.ts — after useTempDataDir() and a cohort() helper as in Task 1

test("a required question left empty is refused", async () => {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين إلزامي");
  const fields = listFields(form.id);

  const result = submitForm(form.token, { [String(fields[0].id)]: "   " });
  assert.equal(result.ok, false);
  assert.match(result.error, /الاسم الكامل/, "the refusal names the question");
});

test("a closed form accepts nothing", async () => {
  const { listFields, submitForm, setFormStatus } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين مسكّر");
  setFormStatus(form.id, "closed");

  const answers = Object.fromEntries(listFields(form.id).map((f) => [String(f.id), "x"]));
  assert.equal(submitForm(form.token, answers).ok, false);
});

test("an unknown link accepts nothing", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  assert.equal(submitForm("nosuchtoken", {}).ok, false);
});

test("an answer to a question this form does not have is ignored", async () => {
  const { listFields, submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين دخيل");
  const answers = Object.fromEntries(listFields(form.id).map((f) => [String(f.id), "نعم"]));
  answers["999999"] = "حقل مش موجود";

  const result = submitForm(form.token, answers);
  assert.equal(result.ok, true);
  const stored = getSubmission((result as { id: number }).id)!;
  assert.equal(stored.answers.some((a) => a.value === "حقل مش موجود"), false);
});

test("the phone is stored normalised", async () => {
  const { listFields, submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين تلفون");
  const fields = listFields(form.id);
  const answers: Record<string, string> = {};
  for (const f of fields) {
    answers[String(f.id)] = f.mapsTo === "phone" ? "054-522-7674" : "نعم";
  }

  const result = submitForm(form.token, answers) as { ok: true; id: number };
  assert.equal(getSubmission(result.id)!.submission.phone, "972545227674");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test tests/forms-submit.test.ts` — Expected: FAIL (`submitForm` is not exported)

- [ ] **Step 3: Implement `submitForm` in `store.ts`**

Looks the form up by token; refuses unless `status === "open"`; walks `listFields` and refuses the first required field whose trimmed value is empty, naming it; maps `phone` through `normalizePhone`; records only answers whose field id is on this form.

- [ ] **Step 4: Write the route**

`POST /api/f/[token]` reads `{ answers }`, calls `submitForm`, answers `{ ok: true }` or `{ error }` with 400.

- [ ] **Step 5: Open the two public prefixes**

In `middleware.ts` add `"/f"` and `"/api/f"` to `publicPrefixes`.

- [ ] **Step 6: Run the tests**

Run: `npx tsx --test tests/forms-submit.test.ts` — Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add app/lib/forms/store.ts app/api/f tests/forms-submit.test.ts middleware.ts
git commit -m "feat: submitting a form, validated against the database"
```

---

## Task 3: Lead → member

**Files:**
- Create: `app/lib/forms/approve.ts`
- Modify: `app/lib/db.ts` (add `updateMemberDetails`)
- Test: `tests/forms-approve.test.ts`

**Interfaces:**
- Consumes: `findMemberByPhone`, `createMember`, `addMembersToGroup`, `listGroupMembers` from `@/app/lib/db`; `getSubmission` from Task 1
- Also adds to `app/lib/db.ts`: `updateMemberDetails(memberId: number, patch: { name?: string; city?: string }): void` — there is no general member update today, only `updateMemberPhone`
- Produces:
  - `approveSubmission(id: number, options?: { overwrite?: boolean }): { ok: true; memberId: number; created: boolean } | { ok: false; error: string }`
  - `rejectSubmission(id: number): void`

- [ ] **Step 1: Write the failing test**

```ts
test("approving an unknown phone creates the member and puts them in the group", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { findMemberByPhone, listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين جديد");
  const id = await fill(form, { name: "سارة عوض", phone: "0545227674", city: "مجد الكروم" });

  const result = approveSubmission(id) as { ok: true; memberId: number; created: boolean };
  assert.equal(result.created, true);

  const member = findMemberByPhone("0545227674")!;
  assert.equal(member.name, "سارة عوض");
  assert.equal(member.city, "مجد الكروم");
  assert.equal(listGroupMembers(group.id).some((m) => m.id === member.id), true);
});

test("a returning member is not overwritten unless asked", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { createMember, findMemberByPhone } = await import("@/app/lib/db");
  createMember({ name: "سارة القديمة", phone: "0545227675", city: "عكا" });

  const { form, group } = await cohort("كلين راجع");
  const id = await fill(form, { name: "سارة الجديدة", phone: "0545227675", city: "حيفا" });

  const result = approveSubmission(id) as { ok: true; memberId: number; created: boolean };
  assert.equal(result.created, false);
  assert.equal(findMemberByPhone("0545227675")!.name, "سارة القديمة", "kept, because overwrite was not asked for");

  const { listGroupMembers } = await import("@/app/lib/db");
  assert.equal(listGroupMembers(group.id).length, 1, "but they are in the cohort either way");
});

test("asking to overwrite updates the member's details", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { createMember, findMemberByPhone } = await import("@/app/lib/db");
  createMember({ name: "ورود القديمة", phone: "0545227676", city: "عكا" });

  const { form } = await cohort("كلين تحديث");
  const id = await fill(form, { name: "ورود الطويل", phone: "0545227676", city: "سخنين" });
  approveSubmission(id, { overwrite: true });

  const member = findMemberByPhone("0545227676")!;
  assert.equal(member.name, "ورود الطويل");
  assert.equal(member.city, "سخنين");
});

test("approving twice does not add the member twice", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين مرتين");
  const id = await fill(form, { name: "أمون", phone: "0545227677", city: "" });

  approveSubmission(id);
  approveSubmission(id);
  assert.equal(listGroupMembers(group.id).length, 1);
});

test("a rejected lead is kept, not deleted", async () => {
  const { rejectSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين مرفوض");
  const id = await fill(form, { name: "تجربة", phone: "0500000001", city: "" });

  rejectSubmission(id);
  assert.equal(getSubmission(id)!.submission.state, "rejected");
});
```

The `fill` helper submits the template's mapped fields with the given values and a placeholder for every other required field.

- [ ] **Step 2: Run and watch it fail**

Run: `npx tsx --test tests/forms-approve.test.ts` — Expected: FAIL (module missing)

- [ ] **Step 3: Implement `approve.ts`**

Reads the submission's mapped answers; `findMemberByPhone`; creates or reuses; `addMembersToGroup` (already `INSERT OR IGNORE`); sets `state = 'added'`, `member_id`, `handled_at`. Returns `{ ok: false }` for a submission that is not `new` only when it has no member — an already-added lead approving again is a no-op that still reports its member.

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test tests/forms-approve.test.ts` — Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/forms/approve.ts tests/forms-approve.test.ts
git commit -m "feat: turning a lead into a member of the cohort"
```

---

## Task 4: The admin API

**Files:**
- Create: `app/api/forms/route.ts`, `app/api/forms/[id]/route.ts`, `app/api/forms/[id]/fields/route.ts`, `app/api/forms/fields/[fieldId]/route.ts`, `app/api/leads/route.ts`, `app/api/leads/[id]/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 3
- Produces: the HTTP surface the leads page uses — `GET/POST /api/forms`, `PATCH/DELETE /api/forms/:id`, `POST /api/forms/:id/fields`, `PATCH/DELETE /api/forms/fields/:fieldId`, `GET /api/leads?formId=&state=`, `GET/POST /api/leads/:id` with `{ action: "approve" | "reject", overwrite?: boolean }`

- [ ] **Step 1: Write the routes**

Thin wrappers, `export const runtime = "nodejs"`, each returning `{ error }` with a 400 on a thrown message — the same shape the journeys routes use.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "^tests/"` — Expected: no output

- [ ] **Step 3: Commit**

```bash
git add app/api/forms app/api/leads
git commit -m "feat: the forms and leads API"
```

---

## Task 5: The public form page

**Files:**
- Create: `app/f/[token]/page.tsx`, `app/f/[token]/FormClient.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `getFormByToken`, `listFields` (server side, in the page)
- Produces: nothing other tasks consume

- [ ] **Step 1: Write the page**

A server component: reads the token from `params` (awaited — Next 15), renders not-found for an unknown token, "انتهى التسجيل" for a closed one, otherwise passes the form and fields to `FormClient`.

- [ ] **Step 2: Write `FormClient`**

`"use client"`. Renders each field by kind — `text`/`phone` as `<input>`, `textarea`, `date` as `<input type="date">`, `choice` as radios, `multi` as checkboxes joined with `، `, `consent` as a single checkbox. Posts to `/api/f/<token>`, shows the server's refusal text, and on success replaces the form with a thank-you.

- [ ] **Step 3: Style it**

RTL, one column, large touch targets — most people fill this on a phone.

- [ ] **Step 4: Build**

Run: `npm run build` — Expected: `Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add app/f app/globals.css
git commit -m "feat: the public registration page"
```

---

## Task 6: The leads page

**Files:**
- Create: `app/leads/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Forms section**

Create a form (name + group picker), list forms with the public link and a copy button, submission count, and an open/closed toggle. Editing a form opens its field list: add, edit, remove, reorder.

- [ ] **Step 2: Leads section**

Filter by form and state. Rows show name, phone, when, and a `موجود مسبقاً` badge. Selecting rows enables **Add to the group**; a selection containing known phones asks once whether to update their details. Opening a row shows every answer, label beside value.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add app/leads app/globals.css
git commit -m "feat: the leads page"
```

---

## Task 7: The menu

**Files:**
- Create: `app/components/AdminNav.tsx`
- Modify: `app/page.tsx`, `app/journeys/page.tsx`, `app/templates/page.tsx`, `app/leads/page.tsx`, `app/globals.css`

- [ ] **Step 1: Write `AdminNav`**

`"use client"`, reads `usePathname()`, renders Inbox · Journeys · Templates · Leads with the current one marked. Replaces the ad-hoc `backLink` pairs on the journeys and templates pages and the toolbar links on the inbox.

- [ ] **Step 2: Wire it into the four pages**

- [ ] **Step 3: Build, test, commit**

```bash
npm run build && npm test
git add app/components app/page.tsx app/journeys/page.tsx app/templates/page.tsx app/leads/page.tsx app/globals.css
git commit -m "feat: one menu across the admin pages"
```

---

## Task 8: Staging, then production

- [ ] **Step 1:** Push to `journeys`, wait for the staging deploy
- [ ] **Step 2:** On staging: create a form against a test group, open its public link in the browser, fill it as a member would, confirm the lead appears, approve it, confirm the member exists and is in the group
- [ ] **Step 3:** Submit a required field empty and confirm the server refuses
- [ ] **Step 4:** Close the form and confirm the link stops accepting
- [ ] **Step 5:** Remove the test data from staging
- [ ] **Step 6:** Merge to `main`, deploy, verify the public link and the leads page on production
- [ ] **Step 7:** Log the work in `afkar/heartbeat/README.md`
