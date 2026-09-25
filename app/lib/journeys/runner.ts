import { createMessage, getMember, updateMessageStatus } from "../db";
import { sendTelegramMessage } from "../telegram";
import { fillNameInText, fillNameToken, renderTemplateBody, sendWhatsAppTemplate, sendWhatsAppText } from "../whatsapp";
import { planTick } from "./engine";
import { drainSmsQueue, openFollowupsForStop, queueStepSms } from "./followups";
import { formatTickReport, journeyLabel } from "./report";
import {
  claimSend,
  completeEnrollment,
  getStep,
  getTemplate,
  listActiveJourneys,
  loadTickState,
  recordSend,
  listLateFailures,
  markSendFailed,
  recordSendState,
  remainingAllowance,
  stopEnrollment,
  syncEnrollments
} from "./store";

const globalForRunner = globalThis as typeof globalThis & { __afkarJourneyRunning?: boolean };

/**
 * What a failed step means, wherever the failure was noticed: the step goes out
 * as its own SMS and the member stays on the path, or - when nothing can reach
 * them - the path ends here and a person picks it up.
 */
function answerFailedSend(input: {
  enrollmentId: number;
  memberId: number;
  stepId: number;
  pathSmsText: string;
  now: Date;
}) {
  const step = getStep(input.stepId);
  const viaSms = step
    ? queueStepSms({
        enrollmentId: input.enrollmentId,
        memberId: input.memberId,
        stepId: input.stepId,
        text: step.smsText
      })
    : false;

  if (viaSms) {
    return "sms" as const;
  }

  if (!stopEnrollment(input.enrollmentId, "send_failed", input.now)) {
    // Already stopped by an earlier failed step: one manual task is enough,
    // and counting this as a second stop would overstate the round.
    return "already-stopped" as const;
  }
  openFollowupsForStop({
    enrollmentId: input.enrollmentId,
    memberId: input.memberId,
    reason: "send_failed",
    smsText: input.pathSmsText
  });
  return "stopped" as const;
}

export type TickTotals = {
  sent: number;
  failed: number;
  stopped: number;
  deferred: number;
  missed: number;
  smsSent: number;
  smsFailed: number;
  smsHeld: number;
};

export async function runDueJourneys(now = new Date()) {
  const totals: TickTotals = {
    sent: 0,
    failed: 0,
    stopped: 0,
    deferred: 0,
    missed: 0,
    smsSent: 0,
    smsFailed: 0,
    smsHeld: 0
  };

  if (globalForRunner.__afkarJourneyRunning) {
    return totals;
  }
  globalForRunner.__afkarJourneyRunning = true;

  try {
    const allowance = await remainingAllowance(now);

    for (const journey of listActiveJourneys()) {
      syncEnrollments(journey.id, now);

      const smsText = getTemplate(journey.templateId)?.smsText ?? "";
      const round = { sent: 0, sentText: 0, sentTemplate: 0, failed: 0, deferred: 0, stopped: 0, smsFallback: 0 };

      // Failures Meta reported after the send that made them are answered here,
      // before anything is planned, so the plan works from the real state.
      for (const late of listLateFailures(journey.id)) {
        markSendFailed(late.sendId, late.error);
        const answer = answerFailedSend({
          enrollmentId: late.enrollmentId,
          memberId: late.memberId,
          stepId: late.stepId,
          pathSmsText: smsText,
          now
        });
        totals.failed += 1;
        round.failed += 1;
        if (answer === "sms") {
          round.smsFallback += 1;
        } else if (answer === "stopped") {
          totals.stopped += 1;
          round.stopped += 1;
        }
      }
      const enrollments = loadTickState(journey.id, now);
      const memberIdByEnrollment = new Map(enrollments.map((item) => [item.enrollmentId, item.memberId]));
      const actions = planTick({ now, allowance, enrollments });

      for (const action of actions) {
        if (action.kind === "stop") {
          stopEnrollment(action.enrollmentId, action.reason, now);
          openFollowupsForStop({
            enrollmentId: action.enrollmentId,
            memberId: memberIdByEnrollment.get(action.enrollmentId) ?? 0,
            reason: action.reason,
            smsText
          });
          totals.stopped += 1;
          round.stopped += 1;
          continue;
        }

        if (action.kind === "complete") {
          completeEnrollment(action.enrollmentId);
          continue;
        }

        if (action.kind === "defer" || action.kind === "missed") {
          recordSendState(action.enrollmentId, action.stepId, action.kind === "defer" ? "deferred" : "missed", now);
          totals[action.kind === "defer" ? "deferred" : "missed"] += 1;
          if (action.kind === "defer") {
            round.deferred += 1;
          }
          continue;
        }

        // Claim the step before sending it, so a process that dies mid-send
        // cannot let the next tick send the same message again.
        const sendId = claimSend(action.enrollmentId, action.stepId, now);
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
          round.failed += 1;
          continue;
        }

        const params = fillNameToken(step.bodyParams, member);
        const freeText = fillNameInText(step.freeText, member);
        const body = action.channel === "text" ? freeText : renderTemplateBody(step.templatePreview, params);
        const message = createMessage({
          memberId: member.id,
          direction: "outgoing",
          body,
          status: "pending",
          sendKey: action.channel === "text" ? step.freeText : step.templatePreview
        });

        try {
          const whatsappMessageId =
            action.channel === "text"
              ? await sendWhatsAppText(member, freeText)
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
          round.sent += 1;
          round[action.channel === "text" ? "sentText" : "sentTemplate"] += 1;
        } catch (error) {
          const text = error instanceof Error ? error.message : "WhatsApp send failed.";
          updateMessageStatus(message.id, { status: "failed", error: text });
          recordSend(sendId, { channel: action.channel, messageId: message.id, state: "failed", error: text });
          totals.failed += 1;
          round.failed += 1;

          const answer = answerFailedSend({
            enrollmentId: action.enrollmentId,
            memberId: memberIdByEnrollment.get(action.enrollmentId) ?? 0,
            stepId: action.stepId,
            pathSmsText: smsText,
            now
          });

          if (answer === "sms") {
            round.smsFallback += 1;
          } else {
            totals.stopped += 1;
            round.stopped += 1;
          }
        }
      }

      // Quiet ticks say nothing; a tick that did something always reports.
      if (round.sent || round.failed || round.stopped || round.deferred) {
        const { name, group } = journeyLabel(journey.id);
        await sendTelegramMessage(formatTickReport({ journeyName: name, groupName: group, ...round }));
      }
    }

    const sms = await drainSmsQueue(now);
    totals.smsSent = sms.sent;
    totals.smsFailed = sms.failed;
    totals.smsHeld = sms.held;

    return totals;
  } finally {
    globalForRunner.__afkarJourneyRunning = false;
  }
}
