import { createHmac, randomUUID } from "node:crypto";

/**
 * The bridge to Afkar's member app (repo afkar-app). HeartBeat owns staff
 * login, so on every server-to-server call it vouches for whoever is clicking
 * with a short-lived signed assertion; the app never sees a HeartBeat password.
 *
 * Nothing here runs unless all four AFKAR_APP_* settings are present — a
 * HeartBeat without them simply has no «التطبيق» card, it does not error.
 */

export type AppConfig = { url: string; serviceKey: string; staffSecret: string; eventsSecret: string };

export function appConfig(): AppConfig | null {
  const url = process.env.AFKAR_APP_URL;
  const serviceKey = process.env.AFKAR_APP_SERVICE_KEY;
  const staffSecret = process.env.AFKAR_APP_STAFF_SECRET;
  const eventsSecret = process.env.AFKAR_APP_EVENTS_SECRET;
  if (!url || !serviceKey || !staffSecret || !eventsSecret) {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), serviceKey, staffSecret, eventsSecret };
}

export type AppRole = "owner" | "staff" | "coach";

/** Assistants and developers run the place for Afkar; anyone unknown gets the narrowest seat. */
export function appRoleOf(role: string): AppRole {
  if (role === "owner") return "owner";
  if (role === "assistant" || role === "developer") return "staff";
  return "coach";
}

type Staff = { id: number; name: string; role: string };

export function staffAssertion(user: Staff, secret: string, now = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: "afkarwts",
      aud: "afkar-app",
      sub: String(user.id),
      name: user.name,
      role: appRoleOf(user.role),
      iat,
      exp: iat + 300
    })
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function signEvent(body: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

type Person = { id: number; name: string; phone: string };
type Enrollment = { programKey: string; startsOn: string; coachUserId: number | null };

export function enrollmentEvent(person: Person, enrollment: Enrollment, now = new Date()) {
  return {
    event_id: randomUUID(),
    type: "enrollment.created" as const,
    occurred_at: now.toISOString(),
    data: {
      person_id: String(person.id),
      display_name: person.name,
      phone: person.phone || null,
      program_key: enrollment.programKey,
      starts_on: enrollment.startsOn,
      coach_user_id: enrollment.coachUserId === null ? null : String(enrollment.coachUserId)
    }
  };
}

export type AppResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const TIMEOUT_MS = 10_000;

async function call<T>(url: string, init: RequestInit): Promise<AppResult<T>> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, status: response.status, error: String(body.reason ?? body.error ?? "ERROR") };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "UNREACHABLE" };
  }
}

/** A call to the app's admin API, as the signed-in HeartBeat user. */
export async function appAdmin<T>(user: Staff, path: string, init: { method?: string; body?: unknown } = {}): Promise<AppResult<T>> {
  const config = appConfig();
  if (!config) return { ok: false, status: 0, error: "NOT_CONFIGURED" };
  return call<T>(`${config.url}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-service-key": config.serviceKey,
      "x-staff-assertion": staffAssertion(user, config.staffSecret)
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

/** Raw bytes from the app's admin API (a member's photo) — never handed to the browser with our keys. */
export async function appAdminBytes(user: Staff, path: string): Promise<{ ok: true; bytes: ArrayBuffer; type: string } | { ok: false; status: number }> {
  const config = appConfig();
  if (!config) return { ok: false, status: 0 };
  try {
    const response = await fetch(`${config.url}${path}`, {
      headers: { "x-service-key": config.serviceKey, "x-staff-assertion": staffAssertion(user, config.staffSecret) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store"
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, bytes: await response.arrayBuffer(), type: response.headers.get("content-type") ?? "application/octet-stream" };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Sends one signed event. The app ignores an event_id it has already seen, so a retry is safe. */
export async function sendAppEvent<T>(event: { event_id: string }): Promise<AppResult<T>> {
  const config = appConfig();
  if (!config) return { ok: false, status: 0, error: "NOT_CONFIGURED" };
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return call<T>(`${config.url}/integrations/afkarwts/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-afkar-timestamp": timestamp,
      "x-afkar-signature": signEvent(body, timestamp, config.eventsSecret)
    },
    body
  });
}
