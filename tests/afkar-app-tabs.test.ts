import test from "node:test";
import assert from "node:assert/strict";

test("the app area has one tab per screen, in the order Afkar builds: food → meals → programs", async () => {
  const { APP_TABS } = await import("@/app/lib/afkar-app/tabs");
  assert.deepEqual(APP_TABS.map((t) => t.href), [
    "/new/app", "/new/app/queues", "/new/app/foods", "/new/app/templates", "/new/app/programs", "/new/app/exercises"
  ]);
});

test("the open tab follows the path — sub-pages light their own tab, the root only on itself", async () => {
  const { appTabOf } = await import("@/app/lib/afkar-app/tabs");
  assert.equal(appTabOf("/new/app"), "/new/app");
  assert.equal(appTabOf("/new/app/"), "/new/app");
  assert.equal(appTabOf("/new/app/foods"), "/new/app/foods");
  assert.equal(appTabOf("/new/app/templates/123"), "/new/app/templates");
  assert.equal(appTabOf("/new/app/programs"), "/new/app/programs");
  assert.equal(appTabOf("/new/app/unknown"), null);
});
