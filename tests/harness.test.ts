import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("the harness gets an empty database with the real schema", async () => {
  const { listMembers, createMember } = await import("@/app/lib/db");

  assert.equal(listMembers().length, 0);
  createMember({ name: "فحص", phone: "+972500000001", notes: "" });
  assert.equal(listMembers().length, 1);
});
