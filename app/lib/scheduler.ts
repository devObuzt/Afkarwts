import { runDueCampaigns } from "./campaigns";

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
  console.log("Afkar campaign scheduler started.");
}

export {};
