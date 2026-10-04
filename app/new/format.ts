const JERUSALEM = "Asia/Jerusalem";

/** Afkar reads her own clock, not UTC — every time on screen is local. */
export function clock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JERUSALEM,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

export function day(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JERUSALEM,
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(iso));
}

const WEEKDAYS: Record<string, string> = {
  Sun: "الأحد",
  Mon: "الاثنين",
  Tue: "الثلاثاء",
  Wed: "الأربعاء",
  Thu: "الخميس",
  Fri: "الجمعة",
  Sat: "السبت"
};

export function weekdayAndDay(instant: Date) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: JERUSALEM, weekday: "short" }).format(instant);
  return `${WEEKDAYS[short] ?? short} ${day(instant.toISOString())}`;
}

/** «قبل ساعتين» rather than a timestamp, for anything from the last few days. */
export function ago(iso: string, now = new Date()) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return "هلق";
  }
  if (minutes < 60) {
    return `قبل ${minutes} دقيقة`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "قبل ساعة" : hours === 2 ? "قبل ساعتين" : `قبل ${hours} ساعات`;
  }

  const days = Math.round(hours / 24);
  if (days === 1) {
    return `أمس ${clock(iso)}`;
  }
  if (days < 7) {
    return `قبل ${days} أيام`;
  }

  return `${day(iso)} ${clock(iso)}`;
}

/** Two letters for the avatar: the first of each of the first two words. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "؟";
  }
  return words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`;
}
