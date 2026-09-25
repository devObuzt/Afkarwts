import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("freezing is ours alone and reversible", async () => {
  const { setFrozen, listFrozen } = await import("@/app/lib/template-catalogue");

  setFrozen("clean_week", true);
  assert.deepEqual(listFrozen(), ["clean_week"]);

  setFrozen("clean_week", false);
  assert.deepEqual(listFrozen(), []);
});

test("freezing does not disturb the internal name, and vice versa", async () => {
  const { setFrozen, listFrozen } = await import("@/app/lib/template-catalogue");
  const { setAlias, listAliases } = await import("@/app/lib/template-aliases");

  setAlias("clean_day1", "اليوم الأول - صباح");
  setFrozen("clean_day1", true);

  assert.equal(listAliases()["clean_day1"], "اليوم الأول - صباح");
  assert.deepEqual(listFrozen(), ["clean_day1"]);

  setAlias("clean_day1", "");
  assert.deepEqual(listFrozen(), ["clean_day1"], "clearing the nickname must not thaw the template");
});

test("a template can sit on several shelves, and assigning twice changes nothing", async () => {
  const { createGroup, assignToGroup, listGroups, removeFromGroup } = await import("@/app/lib/template-catalogue");

  const week1 = createGroup("أسبوع 1");
  const offers = createGroup("عروض");

  assignToGroup(week1.id, "clean_week");
  assignToGroup(week1.id, "clean_week");
  assignToGroup(offers.id, "clean_week");

  const groups = listGroups();
  assert.deepEqual(groups.find((g) => g.name === "أسبوع 1")?.templateNames, ["clean_week"]);
  assert.deepEqual(groups.find((g) => g.name === "عروض")?.templateNames, ["clean_week"]);

  removeFromGroup(week1.id, "clean_week");
  assert.deepEqual(listGroups().find((g) => g.name === "أسبوع 1")?.templateNames, []);
});

test("deleting a group leaves its templates alone", async () => {
  const { createGroup, assignToGroup, deleteGroup, listGroups } = await import("@/app/lib/template-catalogue");
  const { listFrozen } = await import("@/app/lib/template-catalogue");

  const season = createGroup("موسم الصيف");
  assignToGroup(season.id, "summer_offer");
  deleteGroup(season.id);

  assert.equal(listGroups().some((g) => g.name === "موسم الصيف"), false);
  assert.deepEqual(listFrozen().includes("summer_offer"), false);
});

test("a template submitted from a dry environment never reaches Meta", async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_WABA_ID = "test-waba";
  const { createWhatsAppTemplate } = await import("@/app/lib/whatsapp");

  const result = await createWhatsAppTemplate({
    name: "clean_probe_util",
    language: "ar",
    category: "UTILITY",
    bodyText: "سلام {{1}}"
  });

  assert.equal(result.dryRun, true);
  assert.match(result.id, /^template\./);
});
