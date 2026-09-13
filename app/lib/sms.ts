import { dryRunId, isLive } from "./outbound-guard";
import { toLocalIsraeli } from "./sms-format";

const INFORU_URL = "https://capi.inforu.co.il/api/v2/SMS/SendSms";

/**
 * Sending is off until Afkar's Inforu credentials are in place: with
 * SMS_PROVIDER unset, items stay queued and visible rather than failing.
 */
export async function sendSms(phone: string, body: string) {
  const provider = process.env.SMS_PROVIDER ?? "none";

  if (provider === "none" || !isLive()) {
    return { providerRef: dryRunId("sms") };
  }

  // Only a complete Authorization header value authenticates with Inforu.
  const auth = process.env.INFORU_AUTH;
  if (!auth) {
    throw new Error("INFORU_AUTH is missing.");
  }

  const response = await fetch(INFORU_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      Data: {
        Message: body,
        Recipients: [{ Phone: toLocalIsraeli(phone) }],
        Settings: { Sender: (process.env.SMS_SENDER || "afkar").trim() }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Inforu returned ${response.status}.`);
  }

  // Inforu answers 200 with a negative StatusId when it did not actually send.
  const data = (await response.json().catch(() => null)) as
    | { StatusId?: number; StatusDescription?: string; Data?: { StatusId?: number } }
    | null;
  const status = data?.StatusId ?? data?.Data?.StatusId;

  if (status !== undefined && status !== null && Number(status) <= 0) {
    throw new Error(
      `Inforu rejected the message (StatusId ${status}${data?.StatusDescription ? `: ${data.StatusDescription}` : ""}).`
    );
  }

  return { providerRef: String(status ?? "inforu") };
}
