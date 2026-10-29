import assert from "node:assert/strict";
import test from "node:test";
import { isOpen, lastOpenBefore } from "../app/lib/office-hours";

/** لحظة بتوقيت البلاد. تشرين الأول = توقيت صيفي (+03) حتى 25.10، وبعده +02. */
const il = (iso: string) => new Date(iso);

test("الأحد–الخميس 9:00–19:00", () => {
  assert.equal(isOpen(il("2026-11-01T08:59:00+02:00")), false, "قبل التاسعة بدقيقة");
  assert.equal(isOpen(il("2026-11-01T09:00:00+02:00")), true, "التاسعة بالضبط بتفتح");
  assert.equal(isOpen(il("2026-11-01T18:59:00+02:00")), true);
  assert.equal(isOpen(il("2026-11-01T19:00:00+02:00")), false, "السابعة بالضبط بتسكّر");
});

/** الأربعاء مذكور مرتين بجدول وسام، والخاص بيغلب: بيسكّر 17:00 مش 19:00. */
test("الأربعاء بيسكّر الساعة 17:00", () => {
  assert.equal(isOpen(il("2026-11-04T16:59:00+02:00")), true);
  assert.equal(isOpen(il("2026-11-04T17:00:00+02:00")), false);
  // وبنفس الوقت من يوم تاني ضمن «الأحد–الخميس» بيكون لسّه شغّال.
  assert.equal(isOpen(il("2026-11-05T17:00:00+02:00")), true, "الخميس بيضل لـ19:00");
});

test("الجمعة 10:00–15:00 والسبت عطلة كاملة", () => {
  assert.equal(isOpen(il("2026-11-06T09:30:00+02:00")), false, "الجمعة بتبلّش 10 مش 9");
  assert.equal(isOpen(il("2026-11-06T14:59:00+02:00")), true);
  assert.equal(isOpen(il("2026-11-06T15:00:00+02:00")), false);
  for (const hour of ["00:30", "09:00", "12:00", "18:00", "23:30"]) {
    assert.equal(isOpen(il(`2026-11-07T${hour}:00+02:00`)), false, `السبت ${hour}`);
  }
});

/** التوقيت الصيفي: نفس الساعة المحلية لازم تقرا نفس الشي بالصيف وبالشتا. */
test("الساعة محلية، فالتوقيت الصيفي ما بيزحلقها", () => {
  assert.equal(isOpen(il("2026-07-01T09:30:00+03:00")), true, "تموز، توقيت صيفي");
  assert.equal(isOpen(il("2026-01-07T09:30:00+02:00")), true, "كانون الثاني، توقيت شتوي");
  assert.equal(isOpen(il("2026-07-01T19:30:00+03:00")), false);
});

test("آخر لحظة شغل: السبت بيرجّعنا للجمعة 15:00", () => {
  const saturdayNight = il("2026-11-07T23:00:00+02:00");
  const since = lastOpenBefore(saturdayNight);
  assert.ok(since, "لازم تلاقي لحظة شغل قبلها");
  assert.equal(isOpen(since!), true);
  // الجمعة بتسكّر 15:00، فآخر ربع ساعة شغل بيقع قبلها.
  assert.ok(since!.getTime() < il("2026-11-06T15:00:00+02:00").getTime());
  assert.ok(since!.getTime() > il("2026-11-06T14:30:00+02:00").getTime());
});

test("وقت الدوام ما في «آخر لحظة شغل» — نحنا فيها", () => {
  assert.equal(lastOpenBefore(il("2026-11-01T12:00:00+02:00")), null);
});
