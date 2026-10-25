import test from "node:test";
import assert from "node:assert/strict";
import { LABEL_COLOURS, colourForLabel, inkOnLabel } from "@/app/lib/labels/colours";

/**
 * A label needs its own colour, not its kind's.
 *
 * «كلين 15.11» and «كلين 232» are both دفعة, so a tone per kind drew them
 * identically and a list of labels became a wall of one colour.
 */
test("every label gets a colour of its own, and the same name always the same one", () => {
  const a = colourForLabel({ name: "clean 15.11" });
  const b = colourForLabel({ name: "clean 18/10" });
  const again = colourForLabel({ name: "clean 15.11" });

  assert.equal(a, again, "the same label is the same colour on every screen");
  assert.notEqual(a, b, "two batches of the same kind are told apart");
  assert.ok(LABEL_COLOURS.includes(a as (typeof LABEL_COLOURS)[number]));

  // A colour somebody chose by hand wins over the derived one.
  assert.equal(colourForLabel({ name: "clean 15.11", colour: "#123456" }), "#123456");
  // And anything that is not a colour falls back rather than reaching the page.
  assert.equal(colourForLabel({ name: "clean 15.11", colour: "red" }), a);
  assert.equal(colourForLabel({ name: "clean 15.11", colour: "#12345" }), a);

  // Text on the chip is measured, not assumed.
  assert.equal(inkOnLabel("#2F5D50"), "#FFFFFF");
  assert.equal(inkOnLabel("#F4F1EA"), "#1C2B22", "a pale hand-picked colour gets dark ink");
  assert.equal(inkOnLabel("nonsense"), "#FFFFFF");
});
