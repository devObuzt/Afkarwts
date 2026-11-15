import assert from "node:assert/strict";
import test from "node:test";
import { crc32, zip } from "../app/lib/forms/docx";
import { KITS, PART_SIZE, kitDoc, kitDocx, listPhone, roundDate, routeBlocks } from "../app/lib/forms/kits";
import type { WordDoc, WordRow } from "../app/lib/forms/docx";
import type { SubmissionGrid } from "../app/lib/forms/report";

/** Pull one stored entry back out of a zip, so the test reads the real file. */
function unzip(buffer: Buffer, want: string) {
  let at = 0;
  while (at < buffer.length - 4 && buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extraLength = buffer.readUInt16LE(at + 28);
    const name = buffer.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    if (name === want) {
      return buffer.subarray(start, start + size).toString("utf8");
    }
    at = start + size;
  }
  throw new Error(`${want} is not in the file`);
}

function gridWith(rows: Array<Partial<SubmissionGrid["rows"][number]>>): SubmissionGrid {
  return {
    formId: 1,
    formName: "استمارة",
    groupName: "Shad1",
    columns: [],
    cityColumn: null,
    nameColumn: null,
    rows: rows.map((row, index) => ({
      submissionId: index + 1,
      memberId: null,
      state: "new",
      submittedAt: "2026-11-15T10:00",
      cells: [],
      phone: "",
      hebrew: { name: "", nameConfirmed: false, city: "", cityConfirmed: false },
      duplicateOf: [],
      similarTo: [],
      notes: {},
      answerIds: [],
      ...row
    }))
  } as SubmissionGrid;
}

const SAMPLE = gridWith([
  {
    phone: "0545849940",
    hebrew: { name: "אבתסאם זבארקה", nameConfirmed: true, city: "כפר קאסם", cityConfirmed: true },
    notes: {
      medical: "דלקת לבלב / הסרת כיס מרה",
      ocean: "אוקיינוס",
      sending: "משלוח חינם",
      shaper: "صندوق افكار",
      mashbaha: "שליחות עם אתיר סרסור"
    }
  },
  {
    phone: "972549432146",
    hebrew: { name: "נור עלי", nameConfirmed: true, city: "טירה-משולש", cityConfirmed: true },
    notes: { medical: "הנקה חלקית", sending: "משלוח חינם" }
  }
]);

test("a stored zip round-trips through its own reader", () => {
  const made = zip([{ name: "a/b.txt", data: Buffer.from("مرحبا", "utf8") }]);
  assert.equal(unzip(made, "a/b.txt"), "مرحبا");
  // The directory has to name the same entry, or Word opens nothing.
  assert.ok(made.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("the juices list carries the medical note and nothing from the driver's list", () => {
  const xml = unzip(kitDocx(SAMPLE, "juices"), "word/document.xml");
  assert.match(xml, /דלקת לבלב/);
  assert.match(xml, /OCEAN/);
  // SHAPER and משפחה belong to the other list; the press never sees them.
  assert.doesNotMatch(xml, /SHAPER/);
  assert.doesNotMatch(xml, /משפחה/);
  assert.doesNotMatch(xml, /אתיר סרסור/);
});

test("the delivery list carries no medical answer at all", () => {
  const xml = unzip(kitDocx(SAMPLE, "delivery"), "word/document.xml");
  assert.match(xml, /משלוח חינם/);
  assert.match(xml, /SHAPER/);
  assert.match(xml, /אתיר סרסור/);
  // 🔴 The whole point of a separate list: a driver reads no diagnosis.
  assert.doesNotMatch(xml, /דלקת לבלב/);
  assert.doesNotMatch(xml, /הנקה חלקית/);
  assert.doesNotMatch(xml, /OCEAN/);
});

/** Every row of every table, flattened — the file read end to end. */
function allRows(doc: WordDoc): WordRow[] {
  return doc.tables.flatMap((table) => table.rows);
}

/** Only the women's rows, with the region bands dropped. */
function cellRows(rows: WordRow[]) {
  return rows.filter((row): row is string[] => Array.isArray(row));
}

/** Only the bands, in the order they appear. */
function bands(rows: WordRow[]) {
  return rows.filter((row): row is { heading: string } => !Array.isArray(row)).map((row) => row.heading);
}

test("both lists hold every row, numbered straight through", () => {
  for (const kit of ["juices", "delivery"] as const) {
    const doc = kitDoc(SAMPLE, kit);
    const cells = cellRows(allRows(doc));
    assert.equal(cells.length, 2);
    assert.deepEqual(
      cells.map((row) => row[0]),
      ["1.", "2."]
    );
    // Every row is as wide as the header, or the columns slide sideways.
    for (const row of cells) {
      assert.equal(row.length, KITS[kit].columns.length);
    }
    assert.equal(cells[0][1], "אבתסאם זבארקה");
    assert.equal(doc.subtitle, "ערכות Shad1:");
  }
});

test("the file comes out in route order, whatever order the screen is in", () => {
  // Deliberately scrambled, and the West Bank sitting first — the shape a
  // hand-dragged screen can easily be in.
  const grid = gridWith([
    { hebrew: { name: "רמאללה", nameConfirmed: true, city: "רמאללה", cityConfirmed: true } },
    { hebrew: { name: "רהט", nameConfirmed: true, city: "רהט", cityConfirmed: true } },
    { hebrew: { name: "ירושלים", nameConfirmed: true, city: "ירושלים", cityConfirmed: true } },
    { hebrew: { name: "מש בלד", nameConfirmed: true, city: "עיר שלא קיימת", cityConfirmed: true } },
    { hebrew: { name: "סחנין", nameConfirmed: true, city: "סח'נין", cityConfirmed: true } },
    { hebrew: { name: "כפר קאסם", nameConfirmed: true, city: "כפר קאסם", cityConfirmed: true } }
  ]);

  const rows = allRows(kitDoc(grid, "delivery"));

  assert.deepEqual(
    cellRows(rows).map((row) => row[1]),
    ["סחנין", "כפר קאסם", "רהט", "ירושלים", "רמאללה", "מש בלד"]
  );
  // 🔴 The West Bank is its own band at the end, never a tail on
  // Jerusalem: the driver who works inside the Green Line cannot take it.
  assert.deepEqual(bands(rows), ["הצפון — 1", "המרכז — 1", "הדרום — 1", "ירושלים — 1", "הגדה — 1", "ללא אזור — 1"]);
  // The numbering runs through the bands, so the last number is the count.
  assert.deepEqual(
    cellRows(rows).map((row) => row[0]),
    ["1.", "2.", "3.", "4.", "5.", "6."]
  );
});

test("one town's rows keep the order they arrived in", () => {
  const sakhnin = (name: string) => ({
    hebrew: { name, nameConfirmed: true, city: "סח'נין", cityConfirmed: true }
  });
  const blocks = routeBlocks(gridWith([sakhnin("ב"), sakhnin("א"), sakhnin("ג")]));
  assert.equal(blocks.length, 1);
  assert.deepEqual(
    blocks[0].rows.map((row) => row.hebrew.name),
    ["ב", "א", "ג"]
  );
});

test("the list is handed out in fifties, and the remainder is its own table", () => {
  const grid = gridWith(
    Array.from({ length: 123 }, () => ({
      hebrew: { name: "א", nameConfirmed: true, city: "סח'נין", cityConfirmed: true }
    }))
  );
  const doc = kitDoc(grid, "delivery");

  assert.equal(PART_SIZE, 50);
  assert.equal(doc.tables.length, 3);
  assert.deepEqual(
    doc.tables.map((table) => cellRows(table.rows).length),
    [50, 50, 23]
  );
  assert.deepEqual(
    doc.tables.map((table) => table.note),
    [
      "חלק 1 מתוך 3 · שורות 1–50 (50)",
      "חלק 2 מתוך 3 · שורות 51–100 (50)",
      "חלק 3 מתוך 3 · שורות 101–123 (23)"
    ]
  );
  // 🔴 The numbering never restarts: row 51 is row 51 on whichever sheet
  // it lands, and the last number is how many boxes leave.
  assert.equal(cellRows(doc.tables[1].rows)[0][0], "51.");
  assert.equal(cellRows(doc.tables[2].rows).at(-1)?.[0], "123.");
});

test("🔴 the West Bank starts its own table however short it is", () => {
  const grid = gridWith([
    ...Array.from({ length: 4 }, () => ({
      hebrew: { name: "פנים", nameConfirmed: true, city: "סח'נין", cityConfirmed: true }
    })),
    ...Array.from({ length: 2 }, () => ({
      hebrew: { name: "גדה", nameConfirmed: true, city: "רמאללה", cityConfirmed: true }
    })),
    { hebrew: { name: "ללא", nameConfirmed: true, city: "עיר שלא קיימת", cityConfirmed: true } }
  ]);
  const doc = kitDoc(grid, "delivery");

  // Six rows would fit on one sheet — and that sheet would be handed to a
  // driver who cannot cross into the West Bank.
  assert.equal(doc.tables.length, 3);
  assert.deepEqual(
    doc.tables.map((table) => table.note),
    ["חלק 1 מתוך 1 · שורות 1–4 (4)", "הגדה · חלק 1 מתוך 1 · שורות 5–6 (2)", "ללא אזור · חלק 1 מתוך 1 · שורות 7–7 (1)"]
  );
  assert.deepEqual(bands(doc.tables[1].rows), ["הגדה — 2"]);
});

test("a region split over two tables counts itself per table", () => {
  const grid = gridWith(
    Array.from({ length: 60 }, (unused, at) => ({
      hebrew: {
        name: "א",
        nameConfirmed: true,
        // Fifty-five in the north, five in the centre: the north runs over
        // the end of the first table.
        city: at < 55 ? "סח'נין" : "כפר קאסם",
        cityConfirmed: true
      }
    }))
  );
  const doc = kitDoc(grid, "delivery");
  assert.deepEqual(bands(doc.tables[0].rows), ["הצפון — 50"]);
  assert.deepEqual(bands(doc.tables[1].rows), ["הצפון — 5", "המרכז — 5"]);
});

test("each table starts a page, and every page says what it is", () => {
  const grid = gridWith(
    Array.from({ length: 51 }, () => ({
      hebrew: { name: "א", nameConfirmed: true, city: "סח'נין", cityConfirmed: true }
    }))
  );
  const xml = unzip(kitDocx(grid, "delivery"), "word/document.xml");
  assert.equal(xml.split('<w:br w:type="page"/>').length - 1, 1);
  // The cohort and the round are repeated on the second page: a loose
  // sheet has to say what it is without the first one next to it.
  assert.equal(xml.split("ערכות Shad1:").length - 1, 2);
  assert.equal(xml.split("<w:tbl>").length - 1, 2);
});

test("the band spans the table instead of eating a column", () => {
  const xml = unzip(kitDocx(SAMPLE, "delivery"), "word/document.xml");
  assert.match(xml, /<w:gridSpan w:val="7"\/>/);
  assert.match(xml, /FFF2CC/);
});

test("the table reads right to left", () => {
  const xml = unzip(kitDocx(SAMPLE, "juices"), "word/document.xml");
  // Without bidiVisual the first column lands on the left and the whole
  // table comes out mirrored.
  assert.match(xml, /<w:bidiVisual\/>/);
  assert.match(xml, /<w:bidi\/><\/w:sectPr>/);
  assert.match(xml, /<w:rtl\/>/);
});

test("phones print the way the lists carry them", () => {
  assert.equal(listPhone("0545849940"), "545849940");
  assert.equal(listPhone("+972549432146"), "549432146");
  assert.equal(listPhone("972-54-943-2146"), "549432146");
  assert.equal(listPhone(""), "");
  // Ramallah. A country code is kept and marked, never shaved off into
  // something that reads like a local number.
  assert.equal(listPhone("970594183188"), "+970594183188");
  assert.equal(listPhone("+970 59-418-3188"), "+970594183188");
});

test("the round is dated the way the paper lists are", () => {
  assert.equal(roundDate(new Date(2026, 9, 18)), "18.10.26");
});

test("a value that would break the XML is escaped, not dropped", () => {
  const xml = unzip(
    kitDocx(gridWith([{ hebrew: { name: "א & <ב>", nameConfirmed: true, city: "", cityConfirmed: false } }]), "juices"),
    "word/document.xml"
  );
  assert.match(xml, /א &amp; &lt;ב&gt;/);
});
