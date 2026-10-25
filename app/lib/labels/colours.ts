/**
 * A colour per label, not only per kind.
 *
 * The kind already has a tone — مسار is sage, دفعة is olive — and that
 * was enough while a screen showed one label at a time. It is not enough
 * in a list: «كلين 15.11» and «كلين 232» are both دفعة, so both drew the
 * same olive and the eye could not tell one row from another.
 *
 * So every label gets its own colour, picked from a fixed palette and
 * derived from its name. Derived rather than stored, so a label that
 * nobody has coloured still looks like itself from the first render —
 * and the same name is always the same colour, on every screen.
 * A colour set by hand is kept in `groups.colour` and wins.
 *
 * Client-safe: no imports, so the chip in the browser and the swatch on
 * the server draw from one source.
 */

/** Afkar's palette, spread far enough apart to tell apart at chip size. */
export const LABEL_COLOURS = [
  "#5B7B5A", // مريمية
  "#C2703D", // طين
  "#2F5D50", // غابة
  "#8A6E2F", // زيتوني محروق
  "#7A5C8E", // بنفسجي هادئ
  "#3E6E8E", // أزرق مغبّر
  "#A4553E", // قرميدي
  "#4F7A4A", // زيتي
  "#8C5A6E", // توتي
  "#6B6450" // طيني فاتح
] as const;

/**
 * The same name always lands on the same colour. A sum of code points is
 * enough: this is a palette pick, not a hash anybody relies on.
 */
export function colourForLabel(input: { name: string; colour?: string }) {
  const chosen = (input.colour ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(chosen)) {
    return chosen;
  }

  let sum = 0;
  for (const character of input.name.trim()) {
    sum = (sum + character.codePointAt(0)!) % 100_000;
  }
  return LABEL_COLOURS[sum % LABEL_COLOURS.length];
}

/**
 * Text that stays readable on it. The palette is dark enough that white
 * always wins, but a hand-picked colour may not be — so it is measured
 * rather than assumed.
 */
export function inkOnLabel(colour: string) {
  const hex = colour.replace("#", "");
  if (hex.length !== 6) {
    return "#FFFFFF";
  }
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  // Contrast against white vs against near-black, whichever is larger.
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? "#FFFFFF" : "#1C2B22";
}
