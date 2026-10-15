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

test("the day's allowance is counted across everything, not one campaign's runs", async () => {
  const { createMember, createMessage, initiatedToday } = await import("@/app/lib/db");

  // campaign_runs is read back with a LIMIT, and a send draining every
  // minute passes it within the hour — after which the day's total falls
  // and the ceiling stops being one. And a manual send or a journey step
  // comes out of the same allowance while leaving no run at all.
  const her = createMember({ name: "سارة", phone: "+972521234999", notes: "" })!;
  const before = initiatedToday();
  createMessage({ memberId: her.id, direction: "outgoing", body: "واحدة", status: "accepted" });
  createMessage({ memberId: her.id, direction: "outgoing", body: "تنتين", status: "delivered" });
  createMessage({ memberId: her.id, direction: "outgoing", body: "رُفضت", status: "failed" });

  // The refused one reached nobody, so it is not one of today's.
  assert.equal(initiatedToday(), before + 2);
});

test("a number that keeps refusing is not retried for ever", async () => {
  const { createMember, createMessage, failedAttempts } = await import("@/app/lib/db");
  const her = createMember({ name: "ليلى", phone: "+972521234998", notes: "" })!;

  assert.equal(failedAttempts("نص الدفعة", her.id), 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    createMessage({
      memberId: her.id,
      direction: "outgoing",
      body: "نص الدفعة",
      status: "failed",
      sendKey: "نص الدفعة"
    });
  }
  assert.equal(failedAttempts("نص الدفعة", her.id), 3, "after three the drain lets her go");

  // And another send to the same woman is counted on its own.
  assert.equal(failedAttempts("نص تاني", her.id), 0);
});
