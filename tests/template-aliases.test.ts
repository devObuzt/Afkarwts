import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("an alias is stored, replaced and cleared", async () => {
  const { listAliases, setAlias } = await import("@/app/lib/template-aliases");

  assert.deepEqual(listAliases(), {});

  setAlias("clean_day1_weigh_in", "الوزن - اليوم 1");
  assert.deepEqual(listAliases(), { clean_day1_weigh_in: "الوزن - اليوم 1" });

  setAlias("clean_day1_weigh_in", "الميزان صباح اليوم الأول");
  assert.deepEqual(listAliases(), { clean_day1_weigh_in: "الميزان صباح اليوم الأول" });

  // Clearing the field removes the nickname rather than storing an empty one.
  setAlias("clean_day1_weigh_in", "   ");
  assert.deepEqual(listAliases(), {});
});

test("an alias never reaches the template name used for sending", async () => {
  const { setAlias } = await import("@/app/lib/template-aliases");
  const { getDb } = await import("@/app/lib/db");

  setAlias("clean_juice_day_util", "يوم العصير");

  // The aliases live in their own table; nothing in journey_steps changes.
  const columns = (getDb().prepare("PRAGMA table_info(journey_steps)").all() as Array<{ name: string }>).map(
    (row) => row.name
  );
  assert.ok(!columns.includes("alias"));
});
