import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * 🔴 التنزيل كان ناقص عمودين.
 *
 * الاسم والبلدة بالعبري مش أعمدة بالاستمارة — بينحسبوا لحالهن وبينعرضوا
 * بالجدول وبتنزّلهن الطباعة. والتنزيل كان بيكتب أعمدة الاستمارة وبس،
 * فمين بيفتح الملف بيلاقي أعمدة أقل من اللي شافها على الشاشة.
 *
 * وهاد مرّق غلط تاني: فحصت ترتيب الأسماء العبرية من هاد الملف، وطلعت
 * القيم فاضية لأنّ العمود مش موجود — فقريتها «ما في مشكلة» وهي كانت فيها.
 */
async function formWithOneRow() {
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");

  const group = createGroup(`تنزيل ${Math.random()}`);
  const form = createForm({ name: "تنزيل", groupId: group.id, fromTemplate: true });
  const values: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    if (field.label.includes("الاسم الكامل")) values[String(field.id)] = "هيا حسين";
    else if (field.label.includes("البلد")) values[String(field.id)] = "سخنين";
    else if (field.label.includes("رقم الهاتف")) values[String(field.id)] = "0501234567";
    else if (!field.required) continue;
    else if (field.options.length) values[String(field.id)] = field.options[field.options.length - 1];
    else values[String(field.id)] = "—";
  }
  const sent = submitForm(form.token, values, { requirePhoneCode: false });
  assert.equal(sent.ok, true, sent.ok ? "" : sent.error);
  return form;
}

test("التنزيل فيه الاسم والبلدة بالعبري، جنب الاسم العربي", async () => {
  const { gridToCsv, submissionGrid } = await import("@/app/lib/forms/report");
  const form = await formWithOneRow();
  const csv = gridToCsv(submissionGrid(form.id));
  const [header, row] = csv.trim().split("\r\n");

  const cols = header.split(",").map((cell) => cell.replace(/^"|"$/g, ""));
  assert.ok(cols.includes("الاسم بالعبرية"), `ناقص الاسم بالعبرية: ${cols.join(" | ")}`);
  assert.ok(cols.includes("البلدة بالعبرية"), "ناقص البلدة بالعبرية");
  // جنب الاسم العربي، مش مرميين بالآخر.
  assert.equal(cols[cols.indexOf("الاسم الكامل") + 1], "الاسم بالعبرية");
  assert.equal(cols[cols.indexOf("الاسم الكامل") + 2], "البلدة بالعبرية");
  // وعدد الخانات بالسطر بقدّ عدد العناوين — عمود بلا قيمة بيزحزح كل شي بعده.
  assert.equal(row.split('","').length, cols.length);
  // والقيمة هي النقحرة اللي بيعرضها الجدول، مش فاضي.
  assert.ok(row.includes("היא חסין"), `ما نزلت النقحرة: ${row}`);
  assert.ok(row.includes("סח'נין"), "ما نزلت البلدة بالعبري");
});
