/**
 * Plain-language explanations for the failures WhatsApp reports back to us.
 * Meta's own wording ("Message undeliverable") says nothing about what to do,
 * so every failure the campaign view shows is mapped to a reason we can act on.
 */

export type FailureKind =
  | "undeliverable"
  | "experiment"
  | "ecosystem"
  | "window"
  | "params"
  | "rate"
  | "other";

export type FailureReason = {
  kind: FailureKind;
  /** Short label used as the group heading. */
  title: string;
  /** What actually happened, in words a non-engineer can act on. */
  explanation: string;
  /** What to do about it, or null when nothing can be done. */
  action: string | null;
};

const REASONS: Record<FailureKind, Omit<FailureReason, "kind">> = {
  undeliverable: {
    title: "Number could not receive it",
    explanation:
      "WhatsApp tried and could not deliver. Usually the number has no WhatsApp account, or the country code is wrong — a +972 number saved as +970 or the other way round.",
    action: "Check the number below against its alternative form."
  },
  experiment: {
    title: "Held back by a Meta experiment",
    explanation:
      "The number is fine and has WhatsApp. Meta withholds marketing messages from a random sample of users to measure their effect. Utility messages are not affected by this at all.",
    action: "Nothing to fix — send this one as a Utility template instead."
  },
  ecosystem: {
    title: "Blocked by Meta's marketing limit",
    explanation:
      "Meta caps how many marketing messages one person receives. This person already got their share, from us or from another business.",
    action: "Try again in a few days, or send it as a Utility template."
  },
  window: {
    title: "Outside the 24-hour window",
    explanation:
      "Free-text messages only reach someone who wrote to us in the last 24 hours. That window has closed for this contact.",
    action: "Use an approved template instead of free text."
  },
  params: {
    title: "Template values do not match",
    explanation:
      "The template expects a different number of values than we sent, so Meta rejected it before delivery.",
    action: "Reopen the template and fill every variable."
  },
  rate: {
    title: "Sending too fast",
    explanation: "We went over the number of messages Meta allows in this period.",
    action: "The next batch will pick these up automatically."
  },
  other: {
    title: "Other error",
    explanation: "Meta returned an error we do not have a specific explanation for yet.",
    action: null
  }
};

export function classifyFailure(error: string | null | undefined): FailureReason {
  const text = (error ?? "").toLowerCase();

  const kind: FailureKind = !text
    ? "other"
    : text.includes("experiment")
      ? "experiment"
      : text.includes("undeliverable")
        ? "undeliverable"
        : text.includes("healthy ecosystem") || text.includes("marketing message")
          ? "ecosystem"
          : text.includes("re-engagement") || text.includes("24 hour") || text.includes("24-hour")
            ? "window"
            : text.includes("parameters") || text.includes("132000")
              ? "params"
              : text.includes("rate limit") || text.includes("too many")
                ? "rate"
                : "other";

  return { kind, ...REASONS[kind] };
}

/**
 * Local numbers here are either Israeli (+972) or Palestinian (+970) and the
 * two get mixed up constantly in imported sheets. Returns the same subscriber
 * number under the other country code, or null when the shape does not fit.
 */
export function alternateCountryCode(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("972") && digits.length === 12) {
    return `+970${digits.slice(3)}`;
  }
  if (digits.startsWith("970") && digits.length === 12) {
    return `+972${digits.slice(3)}`;
  }
  return null;
}
