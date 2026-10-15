import test from "node:test";
import assert from "node:assert/strict";

test("a date and time typed in Israel become the right UTC instant, summer and winter", async () => {
  const { israelToUtc } = await import("@/app/lib/afkar-app/training");
  assert.equal(israelToUtc("2026-10-16", "21:00"), "2026-10-16T18:00:00.000Z", "IDT is UTC+3");
  assert.equal(israelToUtc("2026-12-01", "09:30"), "2026-12-01T07:30:00.000Z", "IST is UTC+2");
  assert.equal(israelToUtc("2026-13-01", "09:30"), null);
  assert.equal(israelToUtc("2026-12-01", "25:00"), null);
});

test("a meeting from the form: video needs an https link, a title, a sane duration", async () => {
  const { meetingPayload } = await import("@/app/lib/afkar-app/training");
  const ok = meetingPayload({ date: "2026-10-20", time: "18:00", duration: "30", kind: "video", link: " https://zoom.us/j/1 ", title: " متابعة ", note: "" });
  assert.deepEqual(ok, { ok: true, body: { starts_at: "2026-10-20T15:00:00.000Z", duration_min: 30, kind: "video", link: "https://zoom.us/j/1", title: "متابعة", note: "" } });
  assert.deepEqual(meetingPayload({ date: "2026-10-20", time: "18:00", duration: "30", kind: "video", link: "http://zoom.us/j/1", title: "x" }), { ok: false, error: "LINK" });
  assert.deepEqual(meetingPayload({ date: "2026-10-20", time: "18:00", duration: "30", kind: "video", link: "", title: "x" }), { ok: false, error: "LINK" });
  assert.deepEqual(meetingPayload({ date: "2026-10-20", time: "18:00", duration: "30", kind: "phone", title: "" }), { ok: false, error: "TITLE" });
  assert.deepEqual(meetingPayload({ date: "2026-10-20", time: "18:00", duration: "500", kind: "phone", title: "x" }), { ok: false, error: "DURATION" });
  assert.deepEqual(meetingPayload({ date: "", time: "18:00", duration: "30", kind: "phone", title: "x" }), { ok: false, error: "WHEN" });
  const inPerson = meetingPayload({ date: "2026-10-20", time: "18:00", duration: "45", kind: "in_person", place: "مجد الكروم", title: "لقاء" });
  assert.ok(inPerson.ok && inPerson.body.place === "مجد الكروم" && !("link" in inPerson.body));
});

test("a training plan from the editor: each row counted the way its exercise is", async () => {
  const { planPayload } = await import("@/app/lib/afkar-app/training");
  const units = new Map([["a", "reps"], ["b", "minutes"]]);
  const ok = planPayload([
    { exercise_id: "a", sets: "3", reps: "12", minutes: "", weekdays: [0, 2, 2], note: " ببطء " },
    { exercise_id: "b", sets: "", reps: "", minutes: "30", weekdays: [], note: "" }
  ], units);
  assert.deepEqual(ok, { ok: true, items: [
    { exercise_id: "a", sets: 3, reps: 12, weekdays: [0, 2], note: "ببطء" },
    { exercise_id: "b", minutes: 30, weekdays: [], note: "" }
  ] });
  assert.deepEqual(planPayload([{ exercise_id: "a", sets: "3", reps: "", minutes: "", weekdays: [], note: "" }], units), { ok: false, error: "AMOUNT", row: 0 });
  assert.deepEqual(planPayload([{ exercise_id: "b", sets: "", reps: "", minutes: "0", weekdays: [], note: "" }], units), { ok: false, error: "AMOUNT", row: 0 });
  assert.deepEqual(planPayload([{ exercise_id: "zzz", sets: "", reps: "", minutes: "5", weekdays: [], note: "" }], units), { ok: false, error: "EXERCISE", row: 0 });
});
