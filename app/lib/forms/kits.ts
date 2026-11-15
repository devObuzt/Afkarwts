import { buildDocx, type WordRow, type WordTable } from "./docx";
import { REGION_ORDER, placeOf, type Region } from "./regions";
import type { SubmissionGrid } from "./report";

/**
 * The two lists that leave the office every round.
 *
 * Afkar do not hand anybody the registrations table. They hand the juice
 * press one list and the delivery company another, and each gets exactly
 * the columns it can act on — the press needs to know who is pregnant and
 * who has a thyroid, the driver needs to know whose box goes with whom.
 * Giving either one the whole table would hand a stranger a cohort's
 * medical answers, so each list is built from its own column set and
 * nothing travels that was not asked for.
 *
 * Both match the Word documents Afkar already send, column for column.
 */

/**
 * The phone as these lists carry it: nine digits, no country code and no
 * leading zero — «545849940». That is the form the press and the drivers
 * read today, and a number that arrives in another shape is one somebody
 * has to re-type.
 */
export function listPhone(phone: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("972")) {
    return digits.slice(3).replace(/^0/, "");
  }
  if (digits.startsWith("0")) {
    return digits.slice(1);
  }
  // A number from outside the country keeps its code, behind a «+». The
  // Ramallah women's numbers start 970, and bare in a column of nine-digit
  // numbers «970594183188» reads as somebody's typo rather than a country.
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return digits;
}

export const KITS = {
  /** العصائر — the juice press. Medical notes ride with it; nothing else does. */
  juices: {
    label: "العصائر",
    file: "juices",
    columns: [
      // Six, not five: the list runs past a hundred rows and «142.» has
      // to sit on one line.
      { label: "#", width: 6 },
      { label: "שם", width: 22 },
      { label: "ישוב", width: 17 },
      // Wide enough for «+970594183188» on one line. A phone that wraps
      // mid-number is a number somebody dials wrong.
      { label: "טלפון", width: 16 },
      { label: "הערות", width: 28 },
      { label: "OCEAN", width: 11 }
    ],
    // `notes.medical` is what the screen calls «ملاحظات طبية» — the column
    // filled from her own answers, which is what «הערות» holds on this list.
    cells: (row: SubmissionGrid["rows"][number]) => [
      row.hebrew.name,
      row.hebrew.city,
      listPhone(row.phone),
      row.notes.medical ?? "",
      row.notes.ocean ?? ""
    ]
  },
  /** شركات التوصيل — the drivers. No medical column at all. */
  delivery: {
    label: "شركات التوصيل",
    file: "delivery",
    columns: [
      { label: "#", width: 6 },
      { label: "שם", width: 18 },
      { label: "ישוב", width: 14 },
      // See the juices list: a West Bank number has to fit on one line.
      { label: "טלפון", width: 16 },
      { label: "הערות", width: 13 },
      // «صندوق افكار» is on nearly every row: a column too narrow for it
      // doubles the height of the whole list.
      { label: "SHAPER", width: 12 },
      { label: "משפחה", width: 21 }
    ],
    // «הערות» here is the sending note — «משלוח חינם» and the like — not
    // the medical one. A driver has no business reading a diagnosis.
    cells: (row: SubmissionGrid["rows"][number]) => [
      row.hebrew.name,
      row.hebrew.city,
      listPhone(row.phone),
      row.notes.sending ?? "",
      row.notes.shaper ?? "",
      row.notes.mashbaha ?? ""
    ]
  }
} as const;

export type KitKey = keyof typeof KITS;

export function isKitKey(value: string): value is KitKey {
  return value in KITS;
}

/** «18.10.26» — the way the round is dated on the paper lists. */
export function roundDate(at = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${String(at.getFullYear()).slice(2)}`;
}

type KitRow = SubmissionGrid["rows"][number];

/**
 * The region names as the lists carry them — Hebrew, like every column
 * on them. The reader of this file is the press or the driver, not us.
 */
const REGION_HE: Record<Region, string> = {
  north: "הצפון",
  center: "המרכז",
  south: "הדרום",
  jerusalem: "ירושלים",
  westbank: "הגדה"
};

/** A town that is in no region yet. Visible, so it gets placed. */
const NO_REGION = "ללא אזור";

/**
 * The rows in route order, in blocks by region.
 *
 * 🔑 This is the one list that does **not** follow the screen. The table
 * on screen carries whatever was last dragged into it — an alphabetical
 * sort somebody ran, a woman lifted to the top because she collects her
 * own box — and none of that is a delivery route. The file follows the
 * geography in `regions.ts`: north down to the south, then Jerusalem,
 * then the West Bank on its own at the end.
 *
 * Inside one town the incoming order survives, so a hand arrangement
 * within a town is not thrown away.
 */
export function routeBlocks(grid: SubmissionGrid) {
  const rank = (region: Region | null) => (region ? REGION_ORDER.indexOf(region) : REGION_ORDER.length);

  const ranked = grid.rows.map((row, at) => {
    // The Arabic town is the answer she gave; the Hebrew one is what the
    // office wrote. Either one names the place, so both are tried.
    const arabic = grid.cityColumn === null ? "" : (row.cells[grid.cityColumn] ?? "");
    const place = placeOf(arabic, row.hebrew.city);
    return { row, at, region: place?.region ?? null, order: place?.order ?? Number.MAX_SAFE_INTEGER };
  });

  ranked.sort((a, b) => rank(a.region) - rank(b.region) || a.order - b.order || a.at - b.at);

  const blocks: Array<{ region: Region | null; label: string; rows: KitRow[] }> = [];
  for (const item of ranked) {
    const last = blocks[blocks.length - 1];
    if (!last || last.region !== item.region) {
      blocks.push({
        region: item.region,
        label: item.region ? REGION_HE[item.region] : NO_REGION,
        rows: [item.row]
      });
      continue;
    }
    last.rows.push(item.row);
  }

  return blocks;
}

export function kitTable(grid: SubmissionGrid, kit: KitKey, at = new Date()): WordTable {
  const spec = KITS[kit];
  const rows: WordRow[] = [];
  let index = 0;

  for (const block of routeBlocks(grid)) {
    // The numbering runs 1..N straight through the bands: the count at the
    // bottom is how many boxes leave, and a per-region restart hides it.
    rows.push({ heading: `${block.label} — ${block.rows.length}` });
    for (const row of block.rows) {
      index += 1;
      rows.push([`${index}.`, ...spec.cells(row)]);
    }
  }

  return {
    subtitle: `ערכות ${grid.groupName}:`,
    title: `סבב ${roundDate(at)}`,
    columns: [...spec.columns],
    rows
  };
}

export function kitDocx(grid: SubmissionGrid, kit: KitKey, at = new Date()) {
  return buildDocx(kitTable(grid, kit, at));
}
