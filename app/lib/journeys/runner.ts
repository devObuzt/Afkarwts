import { createMessage, getMember, updateMessageStatus } from "../db";
import { sendTelegramMessage } from "../telegram";
import { fillNameToken, renderTemplateBody, sendWhatsAppTemplate, sendWhatsAppText } from "../whatsapp";
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
  recordSendState,
  remainingAllowance,
  stopEnrollment,
  syncEnrollments
} from "./store";

const globalForRunner = globalThis as typeof globalThis & { __afkarJourneyRunning?: boolean };

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
        const body =
          action.channel === "text" ? step.freeText : renderTemplateBody(step.templatePreview, params);
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
          round.sent += 1;
          round[action.channel === "text" ? "sentText" : "sentTemplate"] += 1;
        } catch (error) {
          const text = error instanceof Error ? error.message : "WhatsApp send failed.";
          updateMessageStatus(message.id, { status: "failed", error: text });
          recordSend(sendId, { channel: action.channel, messageId: message.id, state: "failed", error: text });
          totals.failed += 1;
          round.failed += 1;

          // WhatsApp could not deliver this step, so it goes out as the step's
          // own SMS and the member stays on the path - a number that fails this
          // week may work the next. When SMS cannot reach them either, the path
          // ends here and a person picks it up.
          const failedFor = memberIdByEnrollment.get(action.enrollmentId) ?? 0;
          const viaSms = queueStepSms({
            enrollmentId: action.enrollmentId,
            memberId: failedFor,
            stepId: action.stepId,
            text: step.smsText
          });

          if (viaSms) {
            round.smsFallback += 1;
          } else {
            stopEnrollment(action.enrollmentId, "send_failed", now);
            openFollowupsForStop({
              enrollmentId: action.enrollmentId,
              memberId: failedFor,
              reason: "send_failed",
              smsText
            });
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
