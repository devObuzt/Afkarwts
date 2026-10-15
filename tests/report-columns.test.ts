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
  // The mark column is conditional, so the heading, the cell and the
  // width it is paid for with must all hang off the same flag.
  assert.equal((SOURCE.match(/\{markColumn && <th>/g) ?? []).length, 1, "the mark heading");
  assert.equal((SOURCE.match(/\{markColumn && \(/g) ?? []).length, 1, "and its cell — a heading with no cell shifts every answer");
  assert.equal((SOURCE.match(/markColumn \? \[`\$\{markWidth\}%`\]/g) ?? []).length, 1, "and its width in the colgroup");
  // One number for the width, used by the colgroup and by the share it is
  // paid for with. Two literals drifted apart once already.
  assert.equal((SOURCE.match(/markColumn \? markWidth : 0/g) ?? []).length, 1, "and the same number pays for it");
  // One column, two jobs: the duplicate mark, or the way back out of
  // «المرفوضة». A second column would have to be paid for out of the
  // same 100%, and nothing here would notice it was not.
  assert.ok(
    /const markHeading = viewingRejected \? "إرجاع" : canDelete \? "إجراءات" : "تكرار"/.test(SOURCE),
    "the heading says which job the column is doing"
  );

  // The Hebrew pair: two headings, and two cells on each of the two paths
  // (printing renders plain, the screen renders the editor).
  assert.equal((SOURCE.match(/<th>الاسم بالعبرية<\/th>/g) ?? []).length, 1);
  assert.equal((SOURCE.match(/<th>البلدة<\/th>/g) ?? []).length, 1, "one town column, in Hebrew");
  assert.equal((SOURCE.match(/<HebrewCell/g) ?? []).length, 2, "name and city, on screen");
  assert.equal((SOURCE.match(/className="heCell">\{row\.hebrew\./g) ?? []).length, 2, "and when printing");
});

test("a component imported into the report is actually rendered", () => {
  // `DuplicateMark` sat imported and unrendered through a deploy.
  for (const component of ["DuplicateMark", "RestoreMark", "DeleteMark", "SearchBox", "HebrewCell", "EditableCell"]) {
    assert.ok(
      new RegExp(`<${component}[\\s/>]`).test(SOURCE),
      `${component} is imported but never rendered — the header it belongs to has no cell`
    );
  }
});

test("the widths account for every column the table draws", async () => {
  const { columnWidths } = await import("@/app/lib/forms/report");

  // Two Hebrew columns are always drawn and one mark column sometimes,
  // none of which columnWidths knows about — and the Arabic town column is
  // dropped, taking its share of the row with it. The page has to put that
  // share back: this test used to divide by a flat 100 and passed while
  // production shipped a colgroup of 95%.
  const widths = columnWidths({ columns: ["أ", "ب", "ج"], rows: [{ cells: ["1", "22", "333"] }] });
  const num = (w: string) => Number(w.replace("%", ""));

  // Every column the table might drop, including dropping none.
  for (const dropped of [null, 0, 1, 2] as Array<number | null>) {
    const shown = widths.slice(2).map((_, index) => index).filter((index) => index !== dropped);
    // No mark column, the narrow one (duplicates only), and the wide one
    // (with delete) — each has to land on 100.
    for (const [mark, extra] of [[0, 18], [6, 24], [10, 28]] as Array<[number, number]>) {
      const keptTotal = num(widths[0]) + num(widths[1]) + shown.reduce((sum, i) => sum + num(widths[i + 2]), 0);
      const scale = (100 - extra) / keptTotal;
      const shrink = (w: string) => Math.round(num(w) * scale * 100) / 100;
      const laid = [
        shrink(widths[0]),
        ...(mark ? [mark] : []),
        shrink(widths[1]),
        9,
        9,
        ...shown.map((i) => shrink(widths[i + 2]))
      ];
      const total = laid.reduce((sum, value) => sum + value, 0);
      assert.ok(
        Math.abs(total - 100) < 0.5,
        `dropping ${dropped === null ? "nothing" : `column ${dropped}`}${mark ? " with" : " without"} the mark: ${total}%`
      );
      assert.equal(laid.length, shown.length + (mark ? 5 : 4), "one width per column drawn");
    }
  }

  // And the page divides by what it keeps, not by a flat 100.
  assert.ok(
    /const scale = \(100 - extra\) \/ \(keptTotal \|\| 1\)/.test(SOURCE),
    "the page scales against the widths it actually draws"
  );
});

test("the cells come in the order their headings do", () => {
  // The counts matched while the mark sat after the date instead of
  // before it, so every value still read under the wrong heading. Order
  // is the half the count cannot see.
  //
  // Each anchor is something only that cell contains. «row.hebrew.name»
  // was not: the delete control takes it as a prop from the actions cell,
  // which made the name look as though it came before the date.
  const head = SOURCE.slice(SOURCE.indexOf("<thead>"), SOURCE.indexOf("</thead>"));
  const body = SOURCE.slice(SOURCE.indexOf("<tbody>"));

  const headOrder = [
    head.indexOf("<th>#</th>"),
    head.indexOf("markHeading"),
    head.indexOf("<th>التاريخ</th>"),
    head.indexOf("الاسم بالعبرية"),
    head.indexOf("<th>البلدة</th>")
  ];
  const bodyOrder = [
    body.indexOf("index + 1"),
    body.indexOf("markColumn &&"),
    body.indexOf("row.submittedAt"),
    body.indexOf('field="name"'),
    body.indexOf('field="city"')
  ];
  // Printing renders the same two columns plainly; they have to agree.
  const printOrder = [
    body.indexOf('className="heCell">{row.hebrew.name'),
    body.indexOf('className="heCell">{row.hebrew.city')
  ];

  assert.ok(headOrder.every((at) => at >= 0), `every heading is there — ${JSON.stringify(headOrder)}`);
  assert.ok(bodyOrder.every((at) => at >= 0), `and every cell — ${JSON.stringify(bodyOrder)}`);
  assert.ok(printOrder.every((at) => at >= 0), "and the printed pair");

  const rising = (list: number[]) => list.every((at, i) => i === 0 || at > list[i - 1]);
  assert.ok(rising(headOrder), "headings in order");
  assert.ok(rising(bodyOrder), `cells out of order — ${JSON.stringify(bodyOrder)}`);
  assert.ok(rising(printOrder), "the printed Hebrew pair is name then town");
});

test("the headings, the cells and the widths all follow one list", () => {
  // They used to be three independent maps over grid.columns, and the
  // Arabic town column could be dropped from one and not the others.
  const uses = (SOURCE.match(/shown\.map\(/g) ?? []).length;
  assert.equal(uses, 3, `headings, cells and widths — found ${uses} maps over «shown»`);
  assert.ok(
    /const shown = grid\.columns[\s\S]{0,120}!== grid\.cityColumn/.test(SOURCE),
    "and «shown» is what drops the Arabic town column"
  );
});
