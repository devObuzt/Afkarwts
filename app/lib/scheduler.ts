import { runDueCampaigns } from "./campaigns";
import { runDueJourneys } from "./journeys/runner";
import { isLive } from "./outbound-guard";

const globalForScheduler = globalThis as typeof globalThis & {
  __afkarSchedulerStarted?: boolean;
};

// Started as a side effect of the first API request after boot; ticks every
// 30 minutes and each active campaign sends one batch per ~24h.
if (!globalForScheduler.__afkarSchedulerStarted) {
  globalForScheduler.__afkarSchedulerStarted = true;

  const tick = () => {
    runDueCampaigns(24).catch((error) => console.error("Campaign scheduler tick failed:", error));
  };

  setTimeout(tick, 60 * 1000);
  setInterval(tick, 30 * 60 * 1000);

  // Journeys tick far more often than campaigns: a step is due at a given hour,
  // and a missed window is reported rather than sent late.
  const journeyTick = () => {
    runDueJourneys().catch((error) => console.error("Journey scheduler tick failed:", error));
  };

  setTimeout(journeyTick, 30 * 1000);
  setInterval(journeyTick, 5 * 60 * 1000);
  console.log("Afkar campaign scheduler started.");

  if (!isLive()) {
    console.log("Outbound disabled - no WhatsApp, SMS or push will leave this process.");
  }
}

export {};
