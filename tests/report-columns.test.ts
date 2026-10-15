import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The report table is built from four separate lists — the colgroup, the
 * header cells, the body cells and the widths — and nothing ties them
 * together. Twice now an edit landed in one and not the others, and the
 * table shipped with every answer under the wrong heading: the headers
 * said «التاريخ» while the cell held a name.
 *
 * These read the source, which is the only place the four can be compared
 * without a browser.
 */
const SOURCE = readFileSync(new URL("../app/new/forms/[id]/report/page.tsx", import.meta.url), "utf8");

test("every column drawn in the header is drawn in the body too", () => {
  // The duplicate mark is conditional, so its two conditions must match.
  const header = (SOURCE.match(/\{!printing && duplicates > 0 && <th>/g) ?? []).length;
  const body = (SOURCE.match(/\{!printing && duplicates > 0 && \(/g) ?? []).length;
  assert.equal(header, 1, "the duplicate heading");
  assert.equal(body, 1, "and the duplicate cell — a heading with no cell shifts every answer");

  // The Hebrew pair: two headings, and two cells on each of the two paths
  // (printing renders plain, the screen renders the editor).
  assert.equal((SOURCE.match(/<th>الاسم بالعبرية<\/th>/g) ?? []).length, 1);
  assert.equal((SOURCE.match(/<th>البلدة بالعبرية<\/th>/g) ?? []).length, 1);
  assert.equal((SOURCE.match(/<HebrewCell/g) ?? []).length, 2, "name and city, on screen");
  assert.equal((SOURCE.match(/className="heCell">\{row\.hebrew\./g) ?? []).length, 2, "and when printing");
});

test("a component imported into the report is actually rendered", () => {
  // `DuplicateMark` sat imported and unrendered through a deploy.
  for (const component of ["DuplicateMark", "HebrewCell", "EditableCell"]) {
    assert.ok(
      new RegExp(`<${component}[\\s/>]`).test(SOURCE),
      `${component} is imported but never rendered — the header it belongs to has no cell`
    );
  }
});

test("the widths account for every column the table draws", async () => {
  const { columnWidths } = await import("@/app/lib/forms/report");

  // Two Hebrew columns are always drawn and one duplicate column
  // sometimes, none of which columnWidths knows about. The page adds
  // them, and the total still has to be 100 or the colgroup slides.
  const widths = columnWidths({ columns: ["أ", "ب", "ج"], rows: [{ cells: ["1", "22", "333"] }] });
  const shrink = (w: string, scale: number) => Math.round(Number(w.replace("%", "")) * scale * 100) / 100;

  for (const [dup, extra] of [[false, 18], [true, 24]] as Array<[boolean, number]>) {
    const scale = (100 - extra) / 100;
    const laid = [
      shrink(widths[0], scale),
      ...(dup ? [6] : []),
      shrink(widths[1], scale),
      9,
      9,
      ...widths.slice(2).map((w) => shrink(w, scale))
    ];
    const total = laid.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `with${dup ? "" : "out"} the mark the row is ${total}%`);
    assert.equal(laid.length, widths.length + (dup ? 3 : 2), "one width per column drawn");
  }
});
