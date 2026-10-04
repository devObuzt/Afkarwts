const TIME_ZONE = "Asia/Jerusalem";
const DAY_MS = 24 * 60 * 60 * 1000;

/** How far Asia/Jerusalem is from UTC, in minutes, at a given instant. */
function zoneOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = value("hour") === 24 ? 0 : value("hour");
  const asIfUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));

  return (asIfUtc - instant.getTime()) / 60000;
}

/** The instant named by a wall-clock date and time in Asia/Jerusalem. */
export function jerusalemToUtc(dateIso: string, time: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  const firstGuess = new Date(naive - zoneOffsetMinutes(new Date(naive)) * 60000);
  // The offset is read again at the instant found, because the first reading
  // can come from the wrong side of a daylight-saving change.
  return new Date(naive - zoneOffsetMinutes(firstGuess) * 60000);
}

/** The hour in Asia/Jerusalem at a given instant, for the SMS sending window. */
export function jerusalemHour(instant: Date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    hour: "2-digit"
  }).format(instant);
  return Number(hour) === 24 ? 0 : Number(hour);
}

/**
 * A path week is a calendar week — Sunday to Saturday — counted from the week
 * the cohort's start date falls in. Week 1 is that week, week 2 the next, and
 * every day of one path week lands inside one week of the calendar.
 *
 * It used to be seven days rolling from the anchor itself, which looks the
 * same when a cohort starts on a Sunday and comes apart when it does not:
 * Afkar's cohort started on a Wednesday, so its week 2 ran Wednesday to the
 * following Tuesday — the Wednesday-to-Saturday steps in one calendar week
 * and the Sunday-to-Tuesday ones in the next. A week nobody can point at on a
 * calendar is a week nobody can plan with.
 *
 * A week 1 weekday that falls before the start date is simply in the past, and
 * the runner skips it rather than sending it late.
 */
export function stepDueAt(anchorDate: string, step: { week: number; weekday: number; sendTime: string }) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  const weekOpens = anchor - new Date(anchor).getUTCDay() * DAY_MS;
  const dayIso = new Date(weekOpens + ((step.week - 1) * 7 + step.weekday) * DAY_MS).toISOString().slice(0, 10);

  return jerusalemToUtc(dayIso, step.sendTime);
}
