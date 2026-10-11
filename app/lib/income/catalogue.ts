/**
 * What an invoice line actually says the person bought.
 *
 * Morning's catalogue mixes two different things in one field: the مسار the
 * person joined and the إضافات sold beside it — shipping, a top-up payment,
 * a photo day. The income screen was adding them up under one heading
 * called «حسب المسار», so «משלוחים» read as a programme.
 *
 * Wisam's classification (2026-10-11): **CLEAN · EXTRA+ · OCEAN CLEAN ·
 * CLASSIC · TOP** are مسارات. Everything else is an إضافة, Shaper and STEP
 * included — Shaper is a product, not a programme.
 *
 * A line is not one or the other: «CLEAN & SHAPER» is a مسار **and** an
 * إضافة, and «Clean +משלוח» is a مسار and shipping. So a line is read, not
 * sorted into a bucket.
 *
 * Client-safe: no database, because the screens draw what the server counts.
 */

/** The five programmes, spelled the way Afkar's catalogue spells them. */
export const PATHS = ["CLEAN", "EXTRA+", "OCEAN CLEAN", "CLASSIC", "TOP"] as const;
export type PathName = (typeof PATHS)[number];

/**
 * Uppercased, with the Hebrew and Arabic spellings of Clean folded in and
 * punctuation reduced to spaces — «קלין 10%+משלוח» has to read the same as
 * «Clean +משלוח». The `+` survives, because EXTRA+ is told apart by it.
 */
export function normaliseItem(item: string) {
  return item
    .toUpperCase()
    .replace(/קלין|كلين/g, "CLEAN")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .trim();
}

// Order matters: «OCEAN CLEAN» also contains «CLEAN», and the longer name
// has to be tried first or every ocean week would file as a clean week.
const PATH_RULES: Array<[PathName, RegExp]> = [
  ["OCEAN CLEAN", /\bOCEAN\s+CLEAN\b/u],
  ["EXTRA+", /\bEXTRA\s*\+/u],
  ["CLASSIC", /\bCLASSIC\b/u],
  ["TOP", /\bTOP\b/u],
  ["CLEAN", /\bCLEAN\b/u]
];

const EXTRA_RULES: Array<[string, RegExp]> = [
  ["شحن", /משלוח|شحن|\bSHIPPING\b/u],
  ["شيبر", /\bSHAPER\b|שייפר/u],
  ["ستيب", /\bSTEP\b/u],
  ["تكملة دفع", /השלמ/u],
  // Final mem: «צילום» ends in ם and «צילומים» carries מ — one pattern misses the other.
  ["تصوير", /צילומ|צילום/u],
  ["صندوق مفاجآت", /מארז/u],
  ["بوست", /\bBOOST\b/u]
];

export type ItemReading = { path: PathName | null; extras: string[] };

/** The مسار a line names, and the إضافات sold on the same line. */
export function readItem(item: string): ItemReading {
  const text = normaliseItem(item);
  const path = PATH_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  const extras = EXTRA_RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  return { path, extras };
}

/** Every مسار an invoice names. A person can buy two in one document. */
export function pathsOf(items: string[]) {
  const found = new Set<PathName>();
  for (const item of items) {
    const { path } = readItem(item);
    if (path) {
      found.add(path);
    }
  }
  return [...found];
}

export function extrasOf(items: string[]) {
  const found = new Set<string>();
  for (const item of items) {
    for (const extra of readItem(item).extras) {
      found.add(extra);
    }
  }
  return [...found];
}
