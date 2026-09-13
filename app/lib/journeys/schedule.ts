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
 * Week N covers the seven days from the anchor: [anchor + 7(N-1), anchor + 7N).
 * The step falls on the day in that span carrying its weekday, so "week 1 -
 * Sunday - 07:00" on a Sunday anchor is the anchor day itself.
 */
export function stepDueAt(anchorDate: string, step: { week: number; weekday: number; sendTime: string }) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  const intoWeek = (step.weekday - new Date(anchor).getUTCDay() + 7) % 7;
  const dayIso = new Date(anchor + ((step.week - 1) * 7 + intoWeek) * DAY_MS).toISOString().slice(0, 10);

  return jerusalemToUtc(dayIso, step.sendTime);
}
