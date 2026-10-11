import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

function doc(over: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  return {
    morningId: `a${seq}`,
    number: String(2000 + seq),
    docType: 320,
    paidOn: "2026-10-05",
    amount: 445,
    currency: "ILS",
    methods: [3],
    clientName: "ليلى عوض",
    clientPhone: "",
    items: ["CLEAN"],
    description: "",
    orderRef: "",
    url: "",
    soldBy: "",
    ...over
  } as never;
}

test("a person Morning billed and nobody here knew becomes a contact", async () => {
  const { getDb, listMembers } = await import("@/app/lib/db");
  const { savePayments, relinkPayments } = await import("@/app/lib/income/store");
  const { adoptInvoiceContacts } = await import("@/app/lib/income/adopt");
  const { labelsFor } = await import("@/app/lib/labels/store");

  getDb().exec("DELETE FROM payments");

  savePayments(
    [
      doc({ morningId: "p1", clientPhone: "+972521110001", clientName: "سناء حاج", paidOn: "2026-09-01" }),
      // The same woman, twice: one record, and the newer name wins.
      doc({ morningId: "p2", clientPhone: "+972521110001", clientName: "سناء حاج عمر", paidOn: "2026-10-01" }),
      doc({ morningId: "p3", clientPhone: "+972521110002", clientName: "هدى حبش", paidOn: "2026-10-02" })
    ],
    new Map()
  );

  const before = listMembers().length;
  const result = adoptInvoiceContacts();

  assert.equal(result.created, 2, "two people, not three invoices");
  assert.equal(listMembers().length, before + 2);

  const adopted = listMembers().find((member) => member.phone === "+972521110001")!;
  assert.equal(adopted.name, "سناء حاج عمر", "the name on her latest invoice");

  const labels = labelsFor(adopted.id);
  assert.ok(
    labels.some((label) => label.managed === "invoice"),
    "she is marked as having come from an invoice, not from a registration"
  );
  assert.ok(!labels.some((label) => label.kind === "batch"), "and she is in no دفعة, so no schedule reaches her");

  assert.equal(relinkPayments(), 3, "and the money now points at them");
});

test("adopting twice does not make a second copy of anybody", async () => {
  const { getDb, listMembers } = await import("@/app/lib/db");
  const { savePayments } = await import("@/app/lib/income/store");
  const { adoptInvoiceContacts } = await import("@/app/lib/income/adopt");

  getDb().exec("DELETE FROM payments");
  savePayments([doc({ morningId: "q1", clientPhone: "+972521110003", clientName: "رنا صالح" })], new Map());

  assert.equal(adoptInvoiceContacts().created, 1);
  const after = listMembers().length;
  assert.equal(adoptInvoiceContacts().created, 0, "the second pass has nobody left to create");
  assert.equal(listMembers().length, after);
});

test("an invoice with no name or a broken phone is left alone", async () => {
  const { getDb, listMembers } = await import("@/app/lib/db");
  const { savePayments } = await import("@/app/lib/income/store");
  const { adoptInvoiceContacts } = await import("@/app/lib/income/adopt");

  getDb().exec("DELETE FROM payments");
  savePayments(
    [
      doc({ morningId: "r1", clientPhone: "+972521110004", clientName: "   " }),
      doc({ morningId: "r2", clientPhone: "123", clientName: "رقم قصير" }),
      doc({ morningId: "r3", clientPhone: "", clientName: "بلا رقم" })
    ],
    new Map()
  );

  const before = listMembers().length;
  const result = adoptInvoiceContacts();
  assert.equal(result.created, 0, "a contact with no name or no usable number is not a contact");
  assert.equal(listMembers().length, before);
});

test("the مسار on a منتسب comes from what her invoices name", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { savePayments, relinkPayments } = await import("@/app/lib/income/store");
  const { applyPathLabels } = await import("@/app/lib/income/adopt");
  const { labelsFor, removeLabel } = await import("@/app/lib/labels/store");

  getDb().exec("DELETE FROM payments");
  const member = createMember({ name: "مها", phone: "+972521110005" })!;

  savePayments(
    [
      doc({ morningId: "s1", clientPhone: "+972521110005", items: ["CLEAN & SHAPER"] }),
      doc({ morningId: "s2", clientPhone: "+972521110005", items: ["משלוחים"] }),
      doc({ morningId: "s3", clientPhone: "+972521110005", items: ["EXTRA+"] })
    ],
    new Map()
  );
  relinkPayments();

  applyPathLabels();
  const names = labelsFor(member.id).map((label) => label.name).sort();
  assert.deepEqual(names, ["CLEAN", "EXTRA+"], "two مسارات; shipping is not one");
  assert.ok(labelsFor(member.id).every((label) => label.kind === "path"));

  // Taken off by hand, it stays off: the invoice is evidence, not an order.
  const clean = labelsFor(member.id).find((label) => label.name === "CLEAN")!;
  removeLabel(member.id, clean.id, true);
  applyPathLabels();
  assert.ok(
    !labelsFor(member.id).some((label) => label.name === "CLEAN"),
    "the system does not put back what a person took off"
  );
});

test("a مسار label is not a mailing list", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { ensurePathLabel, addLabel } = await import("@/app/lib/labels/store");
  const { createJourney, createStep, createTemplate, syncEnrollments } = await import(
    "@/app/lib/journeys/store"
  );

  const label = ensurePathLabel("CLEAN");
  const member = createMember({ name: "نور", phone: "+972521110009" })!;
  addLabel(member.id, label.id, false);

  const template = createTemplate({ name: "مسار كلين" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "09:00",
    label: "ترحيب",
    freeText: "أهلاً",
    templateName: "",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: ""
  });
  const journey = createJourney({ templateId: template.id, groupId: label.id, anchorDate: "2026-10-11" });

  const result = syncEnrollments(journey.id, new Date("2026-10-11T08:00:00Z"));
  assert.equal(result.added, 0, "six hundred people who bought CLEAN are not a cohort to message");

  const count = (
    getDb().prepare("SELECT COUNT(*) AS c FROM journey_enrollments WHERE journey_id = ?").get(journey.id) as {
      c: number;
    }
  ).c;
  assert.equal(count, 0);

  // And the same person on a دفعة does enrol — otherwise the assertion
  // above would pass just as well with the whole engine switched off.
  const { createGroup } = await import("@/app/lib/db");
  const batch = createGroup("كلين 11.10");
  addLabel(member.id, batch.id, true);
  const real = createJourney({ templateId: template.id, groupId: batch.id, anchorDate: "2026-10-11" });
  assert.equal(syncEnrollments(real.id, new Date("2026-10-11T08:00:00Z")).added, 1, "a دفعة is a cohort");
});
