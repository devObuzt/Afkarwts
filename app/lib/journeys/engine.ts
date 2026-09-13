import { classifyFailure } from "../whatsapp-errors";

/** Free text only reaches someone who wrote in the last 24h; 10 minutes of margin. */
export const FREE_TEXT_WINDOW_MS = (23 * 60 + 50) * 60 * 1000;
/** Silence this long after our last message ends the path for that member. */
export const SILENCE_MS = 48 * 60 * 60 * 1000;
/** A due step may still be sent this long after its time, and no longer. */
export const SEND_WINDOW_MS = 12 * 60 * 60 * 1000;

export type LastSend = {
  stepId: number;
  attemptedAt: string;
  state: "sent" | "failed";
  messageStatus: "pending" | "accepted" | "sent" | "delivered" | "read" | "failed" | null;
  error: string | null;
};

export type PendingStep = { stepId: number; dueAt: string; hasFreeText: boolean };

export type EnrollmentState = {
  enrollmentId: number;
  memberId: number;
  lastIncomingAt: string | null;
  lastSend: LastSend | null;
  /** Window open, no journey_sends row yet. */
  dueSteps: PendingStep[];
  /** Window closed, no journey_sends row yet. */
  expiredSteps: PendingStep[];
  hasUnsentStepsAhead: boolean;
};

export type Action =
  | { kind: "send"; enrollmentId: number; stepId: number; channel: "text" | "template" }
  | { kind: "defer"; enrollmentId: number; stepId: number }
  | { kind: "missed"; enrollmentId: number; stepId: number }
  | { kind: "stop"; enrollmentId: number; reason: "not_delivered" | "not_read" | "send_failed" }
  | { kind: "complete"; enrollmentId: number };

function hasFailed(lastSend: LastSend) {
  return lastSend.state === "failed" || lastSend.messageStatus === "failed";
}

function stopFor(enrollment: EnrollmentState, now: Date): Action | null {
  const last = enrollment.lastSend;
  if (!last) {
    return null;
  }

  if (hasFailed(last)) {
    // A number with no WhatsApp account will not start working in two days.
    // Every other failure is ours to fix, so the member stays in the path.
    return classifyFailure(last.error).kind === "undeliverable"
      ? { kind: "stop", enrollmentId: enrollment.enrollmentId, reason: "send_failed" }
      : null;
  }

  const silentFor = now.getTime() - new Date(last.attemptedAt).getTime();
  const repliedAfter =
    enrollment.lastIncomingAt !== null &&
    new Date(enrollment.lastIncomingAt).getTime() > new Date(last.attemptedAt).getTime();

  // Someone who read it and said nothing was reached, which is what the path
  // is for. Only the unreached leave it.
  if (silentFor < SILENCE_MS || repliedAfter || last.messageStatus === "read") {
    return null;
  }

  return {
    kind: "stop",
    enrollmentId: enrollment.enrollmentId,
    reason: last.messageStatus === "delivered" ? "not_read" : "not_delivered"
  };
}

function channelFor(enrollment: EnrollmentState, step: PendingStep, now: Date) {
  const insideWindow =
    enrollment.lastIncomingAt !== null &&
    now.getTime() - new Date(enrollment.lastIncomingAt).getTime() < FREE_TEXT_WINDOW_MS;

  return insideWindow && step.hasFreeText ? ("text" as const) : ("template" as const);
}

/**
 * The whole rule set, with no database and no network: given what each
 * enrollment looks like right now, what should happen to it.
 */
export function planTick(input: { now: Date; allowance: number; enrollments: EnrollmentState[] }) {
  const actions: Action[] = [];
  let allowance = input.allowance;

  for (const enrollment of input.enrollments) {
    for (const step of enrollment.expiredSteps) {
      actions.push({ kind: "missed", enrollmentId: enrollment.enrollmentId, stepId: step.stepId });
    }

    const stop = stopFor(enrollment, input.now);
    if (stop) {
      actions.push(stop);
      continue;
    }

    for (const step of enrollment.dueSteps) {
      if (allowance > 0) {
        allowance -= 1;
        actions.push({
          kind: "send",
          enrollmentId: enrollment.enrollmentId,
          stepId: step.stepId,
          channel: channelFor(enrollment, step, input.now)
        });
      } else {
        actions.push({ kind: "defer", enrollmentId: enrollment.enrollmentId, stepId: step.stepId });
      }
    }

    const nothingLeft = !enrollment.hasUnsentStepsAhead && enrollment.dueSteps.length === 0;
    // Completion waits out the silence window so the stop check still covers
    // the final message.
    const lastSendSettled =
      enrollment.lastSend !== null &&
      input.now.getTime() - new Date(enrollment.lastSend.attemptedAt).getTime() >= SILENCE_MS;

    if (nothingLeft && lastSendSettled) {
      actions.push({ kind: "complete", enrollmentId: enrollment.enrollmentId });
    }
  }

  return actions;
}
