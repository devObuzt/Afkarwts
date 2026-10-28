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
