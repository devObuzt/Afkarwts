import assert from "node:assert/strict";
import test from "node:test";
import { parseImportRows, readImportList, splitUsable } from "../app/lib/import-rows";

test("a column of bare numbers is a list of people with no names", () => {
  const rows = parseImportRows("0521234567\n+972541234567\n00972501112233");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.name), ["", "", ""]);
  assert.equal(rows[1].phone, "+972541234567");
});

test("name, phone, notes — commas, semicolons or tabs all read the same", () => {
  for (const line of ["ليلى,0521234567,إكسترا", "ليلى;0521234567;إكسترا", "ليلى\t0521234567\tإكسترا"]) {
    const [row] = parseImportRows(line);
    assert.deepEqual([row.name, row.phone, row.notes], ["ليلى", "0521234567", "إكسترا"]);
  }
});

test("an export's header row is read, not imported as a person", () => {
  const rows = parseImportRows(
    "Phone Number,First Name,Last Name,City,CT,Service\n+972521234567,ليلى,حجازي,عرابة,2026-01-02,CLEAN"
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    name: "ليلى حجازي",
    phone: "+972521234567",
    notes: "",
    city: "عرابة",
    joined: "2026-01-02",
    service: "CLEAN"
  });
});

test("an Arabic header row is recognised too", () => {
  const rows = parseImportRows("الاسم,رقم الهاتف\nهدى,0521234567");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, "0521234567");
});

/**
 * The same woman written four ways is one woman — this is what keeps a
 * re-exported list from doubling the group.
 */
test("one person written four ways is imported once", () => {
  const rows = parseImportRows(
    "ليلى,0521234567\nLaila,+972521234567\nل,972521234567\nLaila H,00972521234567"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "ليلى");
});

test("different people are all kept", () => {
  const rows = parseImportRows("0521234567\n0531234567\n0541234567");
  assert.equal(rows.length, 3);
});

test("quotes and blank lines are stripped", () => {
  const rows = parseImportRows('"ليلى","0521234567"\n\n   \n"هدى","0531234567"');
  assert.deepEqual(rows.map((row) => row.name), ["ليلى", "هدى"]);
});

test("a row with no number is separated out before the import runs", () => {
  const rows = parseImportRows("ليلى,0521234567\nهدى,\nسارة,0531234567");
  const { usable, missingPhone } = splitUsable(rows);
  assert.equal(usable.length, 2);
  assert.deepEqual(missingPhone.map((row) => row.name), ["هدى"]);
});

test("nothing pasted is no rows, not a crash", () => {
  assert.deepEqual(parseImportRows(""), []);
  assert.deepEqual(parseImportRows("   \n\n "), []);
});

test("the duplicate count is what the reader dropped, not the header", () => {
  const clean = readImportList("Phone Number,First Name\n0521234567,ليلى\n0531234567,هدى");
  assert.equal(clean.rows.length, 2);
  assert.equal(clean.duplicates, 0, "a header row is not a duplicate");

  const repeated = readImportList("ليلى,0521234567\nLaila,+972521234567\nهدى,0531234567");
  assert.equal(repeated.rows.length, 2);
  assert.equal(repeated.duplicates, 1);
});
