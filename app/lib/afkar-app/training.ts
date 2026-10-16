/**
 * Training and meetings in Afkar's member app, as HeartBeat edits them. These are the
 * rules for what the forms send; the app checks everything again on its side.
 */

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Israel's offset from UTC at an instant, in minutes (+180 in summer, +120 in winter). */
function israelOffset(at: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((local - at.getTime()) / 60_000);
}

/** «2026-10-16» + «21:00» as Afkar means it (Israel time) → the UTC instant, or null if it isn't a real date/time. */
export function israelToUtc(date: string, time: string): string | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  if (new Date(naive).getUTCDate() !== d) return null; // 31.02 and friends
  // Guess with the offset at the naive instant, then correct once — enough across a DST switch.
  let at = naive - israelOffset(new Date(naive)) * 60_000;
  at = naive - israelOffset(new Date(at)) * 60_000;
  return new Date(at).toISOString();
}

type MeetingForm = { date?: unknown; time?: unknown; duration?: unknown; kind?: unknown; link?: unknown; place?: unknown; title?: unknown; note?: unknown; client_key?: unknown };
export type MeetingBody = { starts_at: string; duration_min: number; kind: "video" | "phone" | "in_person"; link?: string; place?: string; title: string; note: string; client_key?: string };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function meetingPayload(form: MeetingForm): { ok: true; body: MeetingBody } | { ok: false; error: "WHEN" | "DURATION" | "KIND" | "LINK" | "TITLE" } {
  const startsAt = israelToUtc(str(form.date), str(form.time));
  if (!startsAt) return { ok: false, error: "WHEN" };
  const duration = Number(str(form.duration));
  if (!Number.isInteger(duration) || duration < 5 || duration > 240) return { ok: false, error: "DURATION" };
  const kind = str(form.kind);
  if (kind !== "video" && kind !== "phone" && kind !== "in_person") return { ok: false, error: "KIND" };
  // Only the field the kind shows is sent: a link left in the form from «فيديو» doesn't ride along on a phone call.
  const link = kind === "video" ? str(form.link) : "";
  if ((kind === "video" && !link) || (link && (!link.startsWith("https://") || link.length > 500))) return { ok: false, error: "LINK" };
  const title = str(form.title);
  if (!title || title.length > 80) return { ok: false, error: "TITLE" };
  const place = kind === "in_person" ? str(form.place).slice(0, 200) : "";
  const clientKey = str(form.client_key).slice(0, 100);
  return {
    ok: true,
    body: {
      starts_at: startsAt, duration_min: duration, kind, ...(link ? { link } : {}), ...(place ? { place } : {}), title,
      note: str(form.note).slice(0, 500), ...(clientKey ? { client_key: clientKey } : {})
    }
  };
}

type PlanRow = { exercise_id: string; sets: string; reps: string; minutes: string; weekdays: number[]; note: string };
export type PlanItem = { exercise_id: string; sets?: number; reps?: number; minutes?: number; weekdays: number[]; note: string };

const whole = (v: string, min: number, max: number) => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The editor's rows → the app's plan. Each row is counted the way its exercise is (sets × reps, or minutes). */
export function planPayload(rows: PlanRow[], unitOf: Map<string, string>): { ok: true; items: PlanItem[] } | { ok: false; error: "EXERCISE" | "AMOUNT"; row: number } {
  const items: PlanItem[] = [];
  for (const [i, row] of rows.entries()) {
    const unit = unitOf.get(row.exercise_id);
    if (!unit) return { ok: false, error: "EXERCISE", row: i };
    const weekdays = [...new Set(row.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    const note = row.note.trim().slice(0, 200);
    if (unit === "minutes") {
      const minutes = whole(row.minutes, 1, 600);
      if (minutes === null) return { ok: false, error: "AMOUNT", row: i };
      items.push({ exercise_id: row.exercise_id, minutes, weekdays, note });
    } else {
      const sets = whole(row.sets, 1, 20);
      const reps = whole(row.reps, 1, 200);
      if (sets === null || reps === null) return { ok: false, error: "AMOUNT", row: i };
      items.push({ exercise_id: row.exercise_id, sets, reps, weekdays, note });
    }
  }
  return { ok: true, items };
}

export type AppExercise = { id: string; name: { ar: string }; category: string; unit: "reps" | "minutes"; howto: string; mine: boolean; archived: boolean };
export type AppPlanItem = { id: string; exercise: AppExercise; sets: number | null; reps: number | null; minutes: number | null; weekdays: number[]; note: string };
export type AppWorkoutLog = { id: string; exercise: AppExercise; local_date: string; sets: number | null; reps: number | null; minutes: number | null; weight_kg: number | null; note: string };
export type AppMeeting = { id: string; starts_at: string; duration_min: number; kind: "video" | "phone" | "in_person"; link: string | null; place: string | null; title: string; note: string; status: "scheduled" | "cancelled" };
