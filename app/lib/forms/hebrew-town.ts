import towns from "./towns-he.json";
import { hebrewNameFor, isHebrewText } from "./hebrew-name";

/**
 * A town in Hebrew, looked up rather than guessed.
 *
 * The towns register carries both names for every locality, so «عرابة» is
 * «עראבה» because that is its name, not because a letter map said so.
 * Only the 252 localities with a real Arabic name can be looked up;
 * anything else falls back to the letter map.
 */
const BY_ARABIC = towns as Record<string, string>;

/**
 * The same town, written the way people actually type it.
 *
 * Both sides are normalised, not just the input: the register has «أم
 * الفحم» with a hamza and a woman types «ام الفحم» without one, so
 * normalising only what she typed matches nothing. The article, the
 * hamzas, the ta marbuta and the dashes all go.
 */
function key(name: string) {
  return name
    .trim()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[-ـ'`"،]/g, " ")
    .replace(/\s+/g, "")
    .replace(/^ال/, "");
}

const INDEX = new Map<string, string>();
for (const [arabic, hebrew] of Object.entries(BY_ARABIC)) {
  const k = key(arabic);
  if (k && !INDEX.has(k)) {
    INDEX.set(k, hebrew);
  }
}

export function hebrewTownFor(city: string) {
  const trimmed = city.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  // Already Hebrew: she typed it in the form it is wanted in.
  if (isHebrewText(trimmed)) {
    return trimmed;
  }

  return INDEX.get(key(trimmed)) ?? hebrewNameFor(trimmed);
}
