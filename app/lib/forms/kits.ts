import { buildDocx, type WordTable } from "./docx";
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
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("972")) {
    digits = digits.slice(3);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

export const KITS = {
  /** العصائر — the juice press. Medical notes ride with it; nothing else does. */
  juices: {
    label: "العصائر",
    file: "juices",
    columns: [
      { label: "#", width: 5 },
      { label: "שם", width: 24 },
      { label: "ישוב", width: 17 },
      { label: "טלפון", width: 14 },
      { label: "הערות", width: 29 },
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
      { label: "#", width: 5 },
      { label: "שם", width: 19 },
      { label: "ישוב", width: 14 },
      { label: "טלפון", width: 13 },
      { label: "הערות", width: 15 },
      { label: "SHAPER", width: 12 },
      { label: "משפחה", width: 22 }
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

export function kitTable(grid: SubmissionGrid, kit: KitKey, at = new Date()): WordTable {
  const spec = KITS[kit];
  return {
    subtitle: `ערכות ${grid.groupName}:`,
    title: `סבב ${roundDate(at)}`,
    columns: [...spec.columns],
    // The order is the table's own — official order or a hand-dragged one.
    // The driver's list and the screen have to agree, or the route is wrong.
    rows: grid.rows.map((row, index) => [`${index + 1}.`, ...spec.cells(row)])
  };
}

export function kitDocx(grid: SubmissionGrid, kit: KitKey, at = new Date()) {
  return buildDocx(kitTable(grid, kit, at));
}
