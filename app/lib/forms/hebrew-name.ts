/**
 * An Arabic name, written in Hebrew letters.
 *
 * Afkar's records end up in Hebrew — the invoices, the delivery lists, the
 * health funds — but the registration form is Arabic, so every name has to
 * be carried across by hand. Arabic and Hebrew are close enough that a
 * letter map gets most names right on the first try, which turns the job
 * from typing into checking.
 *
 * 🔑 What this is **not**: a translation, and not a source of truth. It is
 * a suggestion. Nothing is written to the record until somebody confirms
 * it, because «سارة» can be סארה or שרה depending on the woman, and only
 * she knows which. The screen marks a suggestion so a confirmed name and a
 * guess never look alike.
 */

const LETTERS: Record<string, string> = {
  // The alifs all land on א.
  ا: "א", أ: "א", إ: "א", آ: "א", ء: "א", ئ: "י", ؤ: "ו",
  ب: "ב",
  ت: "ת", ة: "ה", ث: "ת",
  // ج is a hard g in Levantine Arabic, which Hebrew writes with a geresh.
  ج: "ג'",
  ح: "ח", خ: "ח'",
  د: "ד", ذ: "ד'",
  ر: "ר", ز: "ז",
  س: "ס", ش: "ש",
  ص: "צ", ض: "ד'",
  ط: "ט", ظ: "ט'",
  ع: "ע", غ: "ע'",
  ف: "פ", ق: "ק",
  ك: "כ", ل: "ל", م: "מ", ن: "נ",
  ه: "ה", و: "ו", ي: "י", ى: "א",
  // Arabic-Indic digits, in case one strays into a name.
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

/** Letters that change shape at the end of a word. */
const FINAL: Record<string, string> = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

const ARABIC = /[؀-ۿ]/;
const HEBREW = /[֐-׿]/;

export function isArabicText(value: string) {
  return ARABIC.test(value);
}

export function isHebrewText(value: string) {
  return HEBREW.test(value);
}

function transliterateWord(word: string) {
  let out = "";
  for (const character of word) {
    // Harakat and the shadda carry no letter of their own.
    if (/[ً-ْٰـ]/.test(character)) {
      continue;
    }
    out += LETTERS[character] ?? character;
  }

  // A geresh belongs to the letter before it, so the final form is decided
  // by the last Hebrew letter rather than by the last character.
  const match = out.match(/([א-ת])('?)$/);
  if (match && FINAL[match[1]]) {
    out = `${out.slice(0, out.length - match[0].length)}${FINAL[match[1]]}${match[2]}`;
  }

  return out;
}

/**
 * The name in Hebrew letters, or "" when there is nothing useful to offer.
 *
 * A name already written in Hebrew is returned as it stands: it was typed
 * by somebody who knew, and re-deriving it would be worse. A name in Latin
 * letters is left alone — «maria hsarme» could be מריה or מאריה and
 * guessing would put a wrong name on a delivery list.
 */
export function hebrewNameFor(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  if (isHebrewText(trimmed)) {
    return trimmed;
  }

  if (!isArabicText(trimmed)) {
    return "";
  }

  return trimmed
    .split(" ")
    .map(transliterateWord)
    .filter(Boolean)
    .join(" ");
}
