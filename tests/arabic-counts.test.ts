import assert from "node:assert/strict";
import test from "node:test";
import { variables } from "../app/new/format";

/**
 * Arabic counts one, two and many apart. «2 متغيّر» reads as a typo on a
 * screen whose whole job is to be read by the person writing the message.
 */
test("one, two and many each get their own form", () => {
  assert.equal(variables(0), "بلا متغيّرات");
  assert.equal(variables(1), "متغيّر واحد");
  assert.equal(variables(2), "متغيّران");
  assert.equal(variables(3), "3 متغيّرات");
  assert.equal(variables(11), "11 متغيّراً");
});

test("rows: a count that has to sit inside a sentence", () => {
  const { rows } = require("../app/new/format") as { rows: (n: number) => string };
  assert.equal(rows(1), "سطر واحد");
  assert.equal(rows(2), "سطرين");
  assert.equal(rows(5), "5 سطور");
  // «انشال سطر واحد» · «انشال سطرين» · «انشال 5 سطور» — verb first stays singular.
  for (const n of [1, 2, 5, 40]) {
    assert.ok(`انشال ${rows(n)} متكرّر`.startsWith("انشال "));
  }
});

test("the two letters on a conversation come from the dialling code, not a guess", async () => {
  const { dialRegion } = await import("../app/new/format");

  assert.deepEqual(dialRegion("+972521234567"), { code: "IL", known: true });
  assert.deepEqual(dialRegion("972521234567"), { code: "IL", known: true });
  assert.deepEqual(dialRegion("+970599123456"), { code: "PS", known: true });

  // The seven odd rows measured in production: shown as they are, so the
  // five that are really a local number missing its 972 stay visible.
  assert.deepEqual(dialRegion("+548123456"), { code: "+548", known: false });
  assert.deepEqual(dialRegion("+4917612345678"), { code: "+491", known: false });
  assert.equal(dialRegion(""), null);
});
