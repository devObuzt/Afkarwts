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

/**
 * Arabic counts one, two and many apart, and «3 مشترك» reads like a typo.
 * Three forms are enough for the numbers these screens show.
 */
export function count(total: number, forms: { none: string; one: string; two: string; few: string; many: string }) {
  if (total === 0) return forms.none;
  if (total === 1) return forms.one;
  if (total === 2) return forms.two;
  if (total <= 10) return `${total} ${forms.few}`;
  return `${total} ${forms.many}`;
}

export function members(total: number) {
  return count(total, {
    none: "ولا مشترك",
    one: "مشتركة وحدة",
    two: "مشتركتين",
    few: "مشتركات",
    many: "مشتركة"
  });
}

export function people(total: number) {
  return count(total, { none: "ولا حدا", one: "شخص واحد", two: "شخصين", few: "أشخاص", many: "شخص" });
}

/**
 * A stable colour for a name, so a column of initials tells apart at a
 * glance. Five buckets, one per brand hue — the point is difference between
 * neighbours, not an identity.
 */
export function hueOf(name: string) {
  let sum = 0;
  for (const character of name) {
    sum = (sum + character.codePointAt(0)!) % 1000;
  }
  return sum % 5;
}
