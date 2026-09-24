import test from "node:test";
import assert from "node:assert/strict";
import { planTick, type EnrollmentState, type LastSend } from "@/app/lib/journeys/engine";

const NOW = new Date("2026-09-13T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ago(ms: number) {
  return new Date(NOW.getTime() - ms).toISOString();
}

function enrollment(over: Partial<EnrollmentState> = {}): EnrollmentState {
  return {
    enrollmentId: 1,
    memberId: 1,
    lastIncomingAt: null,
    lastSend: null,
    dueSteps: [],
    expiredSteps: [],
    hasUnsentStepsAhead: true,
    ...over
  };
}

function sent(over: Partial<LastSend> = {}): LastSend {
  return {
    stepId: 1,
    attemptedAt: ago(50 * HOUR),
    state: "sent",
    messageStatus: "delivered",
    error: null,
    ...over
  };
}

test("a reply inside the window earns free text", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastIncomingAt: ago(23 * HOUR + 49 * 60 * 1000),
        dueSteps: [{ stepId: 5, dueAt: ago(HOUR), hasFreeText: true }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "send", enrollmentId: 1, stepId: 5, channel: "text" }]);
});

test("a reply past the window falls back to the template", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastIncomingAt: ago(23 * HOUR + 51 * 60 * 1000),
        dueSteps: [{ stepId: 5, dueAt: ago(HOUR), hasFreeText: true }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "send", enrollmentId: 1, stepId: 5, channel: "template" }]);
});

test("a step with no free text always goes as a template", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastIncomingAt: ago(HOUR),
        dueSteps: [{ stepId: 5, dueAt: ago(HOUR), hasFreeText: false }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "send", enrollmentId: 1, stepId: 5, channel: "template" }]);
});

test("47 hours of silence is not yet a stop", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [enrollment({ lastSend: sent({ attemptedAt: ago(47 * HOUR) }) })]
  });

  assert.deepEqual(actions, []);
});

test("49 hours of silence on a delivered message stops for not_read", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [enrollment({ lastSend: sent({ attemptedAt: ago(49 * HOUR) }) })]
  });

  assert.deepEqual(actions, [{ kind: "stop", enrollmentId: 1, reason: "not_read" }]);
});

test("a message that never arrived stops for not_delivered", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [enrollment({ lastSend: sent({ messageStatus: "sent" }) })]
  });

  assert.deepEqual(actions, [{ kind: "stop", enrollmentId: 1, reason: "not_delivered" }]);
});

test("read and silent stays in the path", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({ messageStatus: "read" }),
        dueSteps: [{ stepId: 6, dueAt: ago(HOUR), hasFreeText: false }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "send", enrollmentId: 1, stepId: 6, channel: "template" }]);
});

test("a reply after our message clears the silence", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({ attemptedAt: ago(60 * HOUR) }),
        lastIncomingAt: ago(59 * HOUR)
      })
    ]
  });

  assert.deepEqual(actions, []);
});

test("a failed send is left to the runner, which answers it with SMS", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({
          attemptedAt: ago(HOUR),
          state: "failed",
          messageStatus: "failed",
          error: "Message undeliverable"
        })
      })
    ]
  });

  // The runner sends that step as SMS and keeps the member on the path, so
  // planTick must not end it behind the runner's back.
  assert.deepEqual(actions, []);
});

test("a template parameter failure does not stop the member", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({
          attemptedAt: ago(HOUR),
          state: "failed",
          messageStatus: "failed",
          error: "132000 parameters mismatch"
        }),
        dueSteps: [{ stepId: 7, dueAt: ago(HOUR), hasFreeText: false }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "send", enrollmentId: 1, stepId: 7, channel: "template" }]);
});

test("a stopped member is never sent to in the same tick", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({ attemptedAt: ago(49 * HOUR) }),
        dueSteps: [{ stepId: 8, dueAt: ago(HOUR), hasFreeText: false }]
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "stop", enrollmentId: 1, reason: "not_read" }]);
});

test("sends beyond the allowance are deferred, not dropped", () => {
  const actions = planTick({
    now: NOW,
    allowance: 1,
    enrollments: [
      enrollment({ enrollmentId: 1, dueSteps: [{ stepId: 9, dueAt: ago(HOUR), hasFreeText: false }] }),
      enrollment({ enrollmentId: 2, dueSteps: [{ stepId: 9, dueAt: ago(HOUR), hasFreeText: false }] })
    ]
  });

  assert.deepEqual(actions, [
    { kind: "send", enrollmentId: 1, stepId: 9, channel: "template" },
    { kind: "defer", enrollmentId: 2, stepId: 9 }
  ]);
});

test("a step past its send window is recorded as missed", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [enrollment({ expiredSteps: [{ stepId: 10, dueAt: ago(20 * HOUR), hasFreeText: false }] })]
  });

  assert.deepEqual(actions, [{ kind: "missed", enrollmentId: 1, stepId: 10 }]);
});

test("an enrollment with nothing left completes once its last message has settled", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({ attemptedAt: ago(49 * HOUR), messageStatus: "read" }),
        hasUnsentStepsAhead: false
      })
    ]
  });

  assert.deepEqual(actions, [{ kind: "complete", enrollmentId: 1 }]);
});

test("completion waits until the last message has had its 48 hours", () => {
  const actions = planTick({
    now: NOW,
    allowance: 100,
    enrollments: [
      enrollment({
        lastSend: sent({ attemptedAt: ago(10 * HOUR), messageStatus: "read" }),
        hasUnsentStepsAhead: false
      })
    ]
  });

  assert.deepEqual(actions, []);
});
