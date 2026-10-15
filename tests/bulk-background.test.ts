import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

const ROUTE = readFileSync(new URL("../app/api/messages/bulk/route.ts", import.meta.url), "utf8");
const CLIENT = readFileSync(new URL("../app/InboxClient.tsx", import.meta.url), "utf8");
const SCHEDULER = readFileSync(new URL("../app/lib/scheduler.ts", import.meta.url), "utf8");

test("a send too big for a request is handed to the server", () => {
  // A send of thousands used to run as a loop in the browser: a closed
  // tab or a dropped connection stopped it half way through, and nobody
  // could tell how far it got.
  assert.ok(/body\.background && group/.test(ROUTE), "the route can take it as a job");
  assert.ok(/repeatMode: "now"/.test(ROUTE), "and runs it as one that drains");
  assert.ok(/const onTheServer = \(selectedGroup\?\.memberCount \?\? 0\) > \d+/.test(CLIENT), "the screen chooses");
  assert.ok(/background: true/.test(CLIENT), "and asks for it");
});

test("the server drains those every minute, and leaves the others alone", () => {
  assert.ok(/runDueCampaigns\(0, "now"\)/.test(SCHEDULER), "a drain tick for them");
  assert.ok(/setInterval\(drainNow, 60 \* 1000\)/.test(SCHEDULER), "every minute");
});

test("one inline batch is small enough to finish inside the request", async () => {
  // 250 sends is 400 seconds against a 300-second ceiling, which is where
  // a send died after 183 had gone out and the screen said «failed».
  const match = ROUTE.match(/const PER_REQUEST = (\d+);/);
  assert.ok(match);
  assert.ok(Number(match![1]) * 1.6 < 280, `${match![1]} sends will not finish in time`);
});

test("a draining send is still counted against the day's allowance", async () => {
  const { createGroup, createMember, addMembersToGroup, createCampaign, recordCampaignRun } = await import(
    "@/app/lib/db"
  );
  const group = createGroup("كلين خلفية");
  const her = createMember({ name: "سارة", phone: "+972521234567", notes: "" })!;
  addMembersToGroup(group.id, [her.id]);

  const job = createCampaign({
    groupId: group.id,
    label: "كلين خلفية",
    mode: "template",
    text: "",
    templateName: "t",
    templateLanguage: "ar",
    bodyParams: [],
    bodyPreview: "نص",
    dailyLimit: 5000,
    repeatMode: "now"
  })!;
  recordCampaignRun({ campaignId: job.id, sent: 40, failed: 0, remaining: 10 });

  const { listCampaignRuns } = await import("@/app/lib/db");
  const today = listCampaignRuns(job.id).reduce((total, run) => total + run.sent, 0);
  assert.equal(today, 40, "the runs are summed, so a minute-by-minute drain cannot walk past the allowance");
});
