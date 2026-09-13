import { createMessage, getMember, updateMessageStatus } from "../db";
import { sendWhatsAppTemplate, sendWhatsAppText } from "../whatsapp";
import { planTick } from "./engine";
import {
  claimSend,
  completeEnrollment,
  getStep,
  listActiveJourneys,
  loadTickState,
  recordSend,
  recordSendState,
  remainingAllowance,
  stopEnrollment,
  syncEnrollments
} from "./store";

const globalForRunner = globalThis as typeof globalThis & { __afkarJourneyRunning?: boolean };

export type TickTotals = { sent: number; failed: number; stopped: number; deferred: number; missed: number };

export async function runDueJourneys(now = new Date()) {
  const totals: TickTotals = { sent: 0, failed: 0, stopped: 0, deferred: 0, missed: 0 };

  if (globalForRunner.__afkarJourneyRunning) {
    return totals;
  }
  globalForRunner.__afkarJourneyRunning = true;

  try {
    const allowance = await remainingAllowance(now);

    for (const journey of listActiveJourneys()) {
      syncEnrollments(journey.id, now);

      const enrollments = loadTickState(journey.id, now);
      const memberIdByEnrollment = new Map(enrollments.map((item) => [item.enrollmentId, item.memberId]));
      const actions = planTick({ now, allowance, enrollments });

      for (const action of actions) {
        if (action.kind === "stop") {
          stopEnrollment(action.enrollmentId, action.reason, now);
          totals.stopped += 1;
          continue;
        }

        if (action.kind === "complete") {
          completeEnrollment(action.enrollmentId);
          continue;
        }

        if (action.kind === "defer" || action.kind === "missed") {
          recordSendState(action.enrollmentId, action.stepId, action.kind === "defer" ? "deferred" : "missed");
          totals[action.kind === "defer" ? "deferred" : "missed"] += 1;
          continue;
        }

        // Claim the step before sending it, so a process that dies mid-send
        // cannot let the next tick send the same message again.
        const sendId = claimSend(action.enrollmentId, action.stepId);
        if (sendId === null) {
          continue;
        }

        const step = getStep(action.stepId);
        const member = getMember(memberIdByEnrollment.get(action.enrollmentId) ?? 0);

        if (!step || !member) {
          recordSend(sendId, {
            channel: action.channel,
            messageId: null,
            state: "failed",
            error: "Member or step missing."
          });
          totals.failed += 1;
          continue;
        }

        const body = action.channel === "text" ? step.freeText : step.templatePreview;
        const message = createMessage({ memberId: member.id, direction: "outgoing", body, status: "pending" });

        try {
          const whatsappMessageId =
            action.channel === "text"
              ? await sendWhatsAppText(member, step.freeText)
              : (
                  await sendWhatsAppTemplate(member, {
                    name: step.templateName,
                    language: step.templateLanguage,
                    bodyParams: step.bodyParams
                  })
                ).messageId;

          updateMessageStatus(message.id, { status: "accepted", whatsappMessageId });
          recordSend(sendId, { channel: action.channel, messageId: message.id, state: "sent" });
          totals.sent += 1;
        } catch (error) {
          const text = error instanceof Error ? error.message : "WhatsApp send failed.";
          updateMessageStatus(message.id, { status: "failed", error: text });
          recordSend(sendId, { channel: action.channel, messageId: message.id, state: "failed", error: text });
          totals.failed += 1;
        }
      }
    }

    return totals;
  } finally {
    globalForRunner.__afkarJourneyRunning = false;
  }
}
