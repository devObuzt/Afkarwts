import assert from "node:assert/strict";
import test from "node:test";
import { crc32, zip } from "../app/lib/forms/docx";
import { KITS, kitDocx, kitTable, listPhone, roundDate } from "../app/lib/forms/kits";
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

test("both lists hold every row, numbered in the table's own order", () => {
  for (const kit of ["juices", "delivery"] as const) {
    const table = kitTable(SAMPLE, kit);
    assert.equal(table.rows.length, 2);
    assert.deepEqual(
      table.rows.map((row) => row[0]),
      ["1.", "2."]
    );
    // Every row is as wide as the header, or the columns slide sideways.
    for (const row of table.rows) {
      assert.equal(row.length, KITS[kit].columns.length);
    }
    assert.equal(table.rows[0][1], "אבתסאם זבארקה");
    assert.equal(table.subtitle, "ערכות Shad1:");
  }
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
