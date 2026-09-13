# Afkar Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reusable message paths that run themselves for a cohort group — each step sent on its day and hour, as free text inside WhatsApp's 24-hour window and as a utility template outside it, with unreached members stopped, queued for SMS and listed for manual follow-up.

**Architecture:** Six new tables and a `app/lib/journeys/` module beside the existing campaigns code, which is left untouched. The engine splits into `planTick(state, now)`, a pure function returning actions, and `applyActions`, which performs the I/O — so every rule is tested without a network. All outbound traffic passes through one guard that is live only inside the production Railway project.

**Tech Stack:** Next.js 15 App Router, React 19, `node:sqlite`, `node:test` run through `tsx`, WhatsApp Cloud API, Inforu SMS, Railway.

**Spec:** `docs/superpowers/specs/2026-09-11-afkar-journeys-design.md` — read it before Task 1. Section numbers below (§4.2, §7.1 …) refer to it.

## Global Constraints

- Work only on branch `journeys`. Never commit to `main`, never push to `main`, never run `railway up` against the `Afkarwts` project.
- Outbound traffic is live only when `process.env.RAILWAY_PROJECT_NAME === "Afkarwts" && process.env.DRY_RUN !== "1"`.
- Node ≥ 23 (`package.json` `engines`). The only new dependency in this plan is `tsx`, as a devDependency.
- Database migrations are additive only: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`. No existing table loses or changes a column.
- Step times are authored in `Asia/Jerusalem` and compared in UTC.
- Weekday numbering is `0 = Sunday … 6 = Saturday`, matching `Date.prototype.getDay`.
- The free-text window is 23h50m, not 24h (a 10-minute margin before Meta's limit).
- The silence window before a stop is 48h.
- UI copy is Arabic, matching the existing app.
- `npm run build` must pass before every commit.
- After Task 1, `npm test` must pass before every commit.

---

### Task 1: Test harness

The repo has no tests. Everything after this task is written test-first, so this comes first.

**Files:**
- Modify: `package.json` (scripts, devDependencies)
- Create: `tests/helpers/data-dir.ts`
- Create: `tests/harness.test.ts`

**Interfaces:**
- Produces: `useTempDataDir(): string` — points this process at a fresh empty data directory and returns its path. Call it at module level in a test file, before any `await import()` of application code.

- [ ] **Step 1: Install the runner**

```bash
npm install --save-dev tsx@^4.19.2
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `scripts`:

```json
    "test": "node --import tsx --test \"tests/**/*.test.ts\""
```

- [ ] **Step 3: Write the helper**

`tests/helpers/data-dir.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * `app/lib/db.ts` opens one SQLite connection per process and keeps it on a
 * global, so a test file gets its own database by pointing APP_DATA_DIR at a
 * fresh directory before the module is imported. The test runner gives each
 * file its own process, so one call per file is enough.
 */
export function useTempDataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "afkar-test-"));
  process.env.APP_DATA_DIR = dir;
  return dir;
}
```

- [ ] **Step 4: Write the failing test**

`tests/harness.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("the harness gets an empty database with the real schema", async () => {
  const { listMembers, createMember } = await import("@/app/lib/db");

  assert.equal(listMembers().length, 0);
  createMember({ name: "فحص", phone: "+972500000001", notes: "" });
  assert.equal(listMembers().length, 1);
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS. If `createMember`'s signature differs, open `app/lib/db.ts`, match the real one, and keep the assertion.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/
git commit -m "test: add node:test harness with an isolated data directory"
```

---

### Task 2: Outbound guard

Nothing may leave the process outside the production project (§4.2). This lands before the staging deployment, and before any journeys code exists, because it is what makes the copied database safe.

**Files:**
- Create: `app/lib/outbound-guard.ts`
- Modify: `app/lib/whatsapp.ts` (`sendWhatsAppText`, `sendWhatsAppTemplate`, `sendWhatsAppMedia`, `uploadWhatsAppMedia`)
- Modify: `app/lib/push.ts` (`sendPushToDevices`)
- Modify: `app/lib/telegram.ts` (`sendTelegramMessage`)
- Create: `tests/outbound-guard.test.ts`

**Interfaces:**
- Produces: `isLive(): boolean`, `dryRunId(prefix?: string): string` (returns `dryrun.<uuid>`).

- [ ] **Step 1: Write the failing test**

`tests/outbound-guard.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// Dry by default: RAILWAY_PROJECT_NAME is unset outside Railway.
process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "hello_world";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";
process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.TELEGRAM_BOT_TOKEN = "test-bot";
process.env.TELEGRAM_CHAT_ID = "1";

const member = {
  id: 1,
  name: "فحص",
  phone: "+972500000001",
  notes: "",
  city: "",
  joined: "",
  service: "",
  lastReadMessageId: null,
  unreadCount: 0,
  groupIds: [],
  createdAt: new Date().toISOString()
};

function failingFetch() {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error(`network call escaped the guard: ${String(input)}`);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("no WhatsApp send reaches the network when not live", async () => {
  const { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia, uploadWhatsAppMedia } = await import(
    "@/app/lib/whatsapp"
  );
  const net = failingFetch();

  try {
    const textId = await sendWhatsAppText(member, "مرحبا");
    // No `name` is passed, so the template's parameter check — a live GET — is
    // skipped and only the send path is under test here.
    const template = await sendWhatsAppTemplate(member, {});
    const mediaId = await uploadWhatsAppMedia({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: "a.png"
    });
    const mediaMessageId = await sendWhatsAppMedia({ member, mediaId, kind: "image" });

    assert.match(textId, /^dryrun\./);
    assert.match(template.messageId, /^dryrun\./);
    assert.match(mediaId, /^dryrun\./);
    assert.match(mediaMessageId, /^dryrun\./);
    assert.deepEqual(net.calls, []);
  } finally {
    net.restore();
  }
});

test("push is skipped when not live", async () => {
  const { sendPushToDevices } = await import("@/app/lib/push");
  const net = failingFetch();

  try {
    const result = await sendPushToDevices({ title: "فحص", body: "فحص" });
    assert.deepEqual(result, { sent: 0, skipped: true });
    assert.deepEqual(net.calls, []);
  } finally {
    net.restore();
  }
});

test("telegram still sends, marked as a simulation", async () => {
  const { sendTelegramMessage } = await import("@/app/lib/telegram");
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendTelegramMessage("تقرير");
    assert.equal(bodies.length, 1);
    assert.ok(bodies[0].includes("محاكاة"));
  } finally {
    globalThis.fetch = original;
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/outbound-guard'` is not thrown yet; instead the WhatsApp test fails with "network call escaped the guard".

- [ ] **Step 3: Write the guard**

`app/lib/outbound-guard.ts`:

```ts
import { randomUUID } from "node:crypto";

/**
 * Outbound traffic is live only inside the production Railway project. Staging,
 * local development and any copy of the production database are dry by default,
 * so a forgotten variable can never reach a real contact.
 */
export function isLive() {
  return process.env.RAILWAY_PROJECT_NAME === "Afkarwts" && process.env.DRY_RUN !== "1";
}

export function dryRunId(prefix = "dryrun") {
  return `${prefix}.${randomUUID()}`;
}
```

- [ ] **Step 4: Apply it to WhatsApp**

In `app/lib/whatsapp.ts`, add to the imports:

```ts
import { dryRunId, isLive } from "./outbound-guard";
```

In `sendWhatsAppText`, `sendWhatsAppMedia` and `uploadWhatsAppMedia`, immediately **before** the outbound `await fetch(...)` call:

```ts
  if (!isLive()) {
    return dryRunId();
  }
```

In `sendWhatsAppTemplate`, immediately before its outbound `await fetch(...)`:

```ts
  if (!isLive()) {
    return { messageId: dryRunId(), templateName, templateLanguage };
  }
```

The guard goes before the send `fetch` and after the existing validation, so template parameter checking still runs on staging.

- [ ] **Step 5: Apply it to push and Telegram**

In `app/lib/push.ts`, at the top of `sendPushToDevices`:

```ts
  if (!isLive()) {
    return { sent: 0, skipped: true };
  }
```

In `app/lib/telegram.ts`, at the top of `sendTelegramMessage`:

```ts
  const body = isLive() ? text : `🧪 ستيجينج · محاكاة\n${text}`;
```

and send `body` instead of `text`. Add the `isLive` import to both files.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, all three tests.

- [ ] **Step 7: Log the state at boot**

In `app/lib/scheduler.ts`, inside the existing `if (!globalForScheduler.__afkarSchedulerStarted)` block, after the existing `console.log`:

```ts
  if (!isLive()) {
    console.log("Outbound disabled — no WhatsApp, SMS or push will leave this process.");
  }
```

- [ ] **Step 8: Commit**

```bash
git add app/lib/outbound-guard.ts app/lib/whatsapp.ts app/lib/push.ts app/lib/telegram.ts app/lib/scheduler.ts tests/outbound-guard.test.ts
git commit -m "feat: send nothing outside the production project"
```

---

### Task 3: Delivery statuses only move forward

Meta delivers status updates out of order. A late `delivered` after `read` turns a reader into a non-reader, and the stop rule (§7.1) would then stop someone who read every message. This is a prerequisite for the engine.

**Files:**
- Modify: `app/lib/db.ts:1086-1106` (`updateMessageStatusByWhatsAppId`)
- Create: `tests/message-status-order.test.ts`

**Interfaces:**
- Produces: `statusRank(status: Message["status"]): number` exported from `app/lib/db.ts`.

- [ ] **Step 1: Write the failing test**

`tests/message-status-order.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

async function seed(whatsappMessageId: string) {
  const { createMember, createMessage } = await import("@/app/lib/db");
  const member = createMember({ name: "فحص", phone: `+97250${Date.now() % 10000000}`, notes: "" });
  createMessage({
    memberId: member.id,
    direction: "outgoing",
    body: "رسالة",
    status: "accepted",
    whatsappMessageId
  });
  return member;
}

test("a late delivered does not overwrite read", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.1");

  updateMessageStatusByWhatsAppId("wamid.1", { status: "read" });
  const after = updateMessageStatusByWhatsAppId("wamid.1", { status: "delivered" });

  assert.equal(after?.status, "read");
});

test("statuses still move forward", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.2");

  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "sent" })?.status, "sent");
  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "delivered" })?.status, "delivered");
  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "read" })?.status, "read");
});

test("failed replaces an early status but not a delivered one", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.3");
  await seed("wamid.4");

  const early = updateMessageStatusByWhatsAppId("wamid.3", { status: "failed", error: "undeliverable" });
  assert.equal(early?.status, "failed");
  assert.equal(early?.error, "undeliverable");

  updateMessageStatusByWhatsAppId("wamid.4", { status: "delivered" });
  const late = updateMessageStatusByWhatsAppId("wamid.4", { status: "failed", error: "undeliverable" });
  assert.equal(late?.status, "delivered");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="late delivered"`
Expected: FAIL — `expected 'read', got 'delivered'`.

- [ ] **Step 3: Implement the ordering**

In `app/lib/db.ts`, above `updateMessageStatusByWhatsAppId`:

```ts
const STATUS_RANK: Record<Message["status"], number> = {
  received: 0,
  pending: 1,
  accepted: 2,
  sent: 3,
  delivered: 4,
  read: 5,
  failed: 3
};

/** Meta delivers status updates out of order, so a status only ever moves forward. */
export function statusRank(status: Message["status"]) {
  return STATUS_RANK[status];
}
```

Then replace the body of `updateMessageStatusByWhatsAppId` between the `if (!existing)` guard and the final `SELECT` with:

```ts
  const isFailure = input.status === "failed";
  const alreadyDelivered = existing.status === "delivered" || existing.status === "read";
  const moveForward = statusRank(input.status) > statusRank(existing.status);
  const accepted = isFailure ? !alreadyDelivered : moveForward;

  if (accepted) {
    getDb()
      .prepare("UPDATE messages SET status = ?, error = ? WHERE whatsapp_message_id = ?")
      .run(input.status, input.error ?? null, whatsappMessageId);
  }
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, everything including Tasks 1–2.

- [ ] **Step 5: Commit**

```bash
git add app/lib/db.ts tests/message-status-order.test.ts
git commit -m "fix: keep delivery statuses from moving backwards"
```

---

### Task 4: Shared webhook handler and the simulator

Staging has no Meta webhook (§4.3). Replies and delivery statuses are injected through an endpoint that runs the **same** handler the real webhook uses, so the tested path is the real one.

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`
- Create: `app/lib/whatsapp-webhook.ts`
- Create: `app/api/dev/simulate/route.ts`
- Create: `tests/simulate.test.ts`

**Interfaces:**
- Produces: `handleWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void>` in `app/lib/whatsapp-webhook.ts`.
- Produces: `buildIncomingPayload(input: { phone: string; text: string; messageId?: string; profileName?: string }): WhatsAppWebhookPayload` and `buildStatusPayload(input: { whatsappMessageId: string; status: "sent" | "delivered" | "read" | "failed"; error?: string }): WhatsAppWebhookPayload`, both in `app/lib/whatsapp-webhook.ts`.

- [ ] **Step 1: Move the handler**

Create `app/lib/whatsapp-webhook.ts` and move into it, unchanged: the `IncomingMedia` and `WhatsAppWebhookPayload` types, the `notifyDevices` helper, and the whole body of the route's `POST` after `const payload = await request.json()`. Export it as:

```ts
export async function handleWebhookPayload(payload: WhatsAppWebhookPayload) {
  // the moved body, unchanged
}
```

`app/api/webhook/whatsapp/route.ts` keeps its `GET` verification and its `POST` becomes:

```ts
export async function POST(request: Request) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;
  await handleWebhookPayload(payload);
  return NextResponse.json({ ok: true });
}
```

Behaviour must not change. This is a move, not a rewrite.

- [ ] **Step 2: Add the payload builders**

In `app/lib/whatsapp-webhook.ts`:

```ts
function wrap(value: Record<string, unknown>): WhatsAppWebhookPayload {
  return { entry: [{ changes: [{ value }] }] } as WhatsAppWebhookPayload;
}

export function buildIncomingPayload(input: {
  phone: string;
  text: string;
  messageId?: string;
  profileName?: string;
}) {
  const from = input.phone.replace(/[^\d]/g, "");
  return wrap({
    contacts: input.profileName ? [{ wa_id: from, profile: { name: input.profileName } }] : [],
    messages: [
      {
        from,
        id: input.messageId ?? `sim.${Date.now()}`,
        type: "text",
        text: { body: input.text }
      }
    ]
  });
}

export function buildStatusPayload(input: {
  whatsappMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
}) {
  return wrap({
    statuses: [
      {
        id: input.whatsappMessageId,
        status: input.status,
        errors: input.error ? [{ title: input.error, message: input.error }] : undefined
      }
    ]
  });
}
```

- [ ] **Step 3: Write the failing test**

`tests/simulate.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("a simulated reply lands as an incoming message", async () => {
  const { createMember, listMessages } = await import("@/app/lib/db");
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");

  const member = createMember({ name: "فحص", phone: "+972500000002", notes: "" });
  await handleWebhookPayload(buildIncomingPayload({ phone: member.phone, text: "أهلين" }));

  const messages = listMessages(member.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].direction, "incoming");
  assert.equal(messages[0].body, "أهلين");
});

test("a simulated status updates the message", async () => {
  const { createMember, createMessage, listMessages } = await import("@/app/lib/db");
  const { buildStatusPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");

  const member = createMember({ name: "فحص", phone: "+972500000003", notes: "" });
  createMessage({
    memberId: member.id,
    direction: "outgoing",
    body: "رسالة",
    status: "accepted",
    whatsappMessageId: "dryrun.abc"
  });

  await handleWebhookPayload(buildStatusPayload({ whatsappMessageId: "dryrun.abc", status: "read" }));
  assert.equal(listMessages(member.id)[0].status, "read");
});
```


- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the endpoint**

`app/api/dev/simulate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isLive } from "@/app/lib/outbound-guard";
import { getMember } from "@/app/lib/db";
import { buildIncomingPayload, buildStatusPayload, handleWebhookPayload } from "@/app/lib/whatsapp-webhook";

export const runtime = "nodejs";

type Body =
  | { type: "incoming"; memberId: number; text: string }
  | { type: "status"; whatsappMessageId: string; status: "sent" | "delivered" | "read" | "failed"; error?: string };

export async function POST(request: Request) {
  // The simulator does not exist in production.
  if (isLive()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as Body;

  if (body.type === "incoming") {
    const member = getMember(body.memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    await handleWebhookPayload(buildIncomingPayload({ phone: member.phone, text: body.text }));
    return NextResponse.json({ ok: true });
  }

  if (body.type === "status") {
    await handleWebhookPayload(buildStatusPayload(body));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type." }, { status: 400 });
}
```


- [ ] **Step 6: Verify the build**

Run: `npm run build && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib/whatsapp-webhook.ts app/api/webhook/whatsapp/route.ts app/api/dev/simulate/route.ts tests/simulate.test.ts
git commit -m "feat: share the webhook handler with a simulator for staging"
```

---

### Task 5: Staging deployment

The guard and the simulator exist, so the environment can be built and proven safe before the engine lands. Nothing here touches the `Afkarwts` project.

**Files:**
- Create: `docs/staging.md`
- No application code changes.

**Interfaces:**
- Produces: a staging URL, recorded in `docs/staging.md` and in `~/Documents/connec-clients/afkar/heartbeat/README.md`.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin journeys
```

Production deploys from `main`, so this cannot reach it.

- [ ] **Step 2: Create the project and service**

Create a Railway project named `afkar-heartbeat-staging`, one service deploying branch `journeys` of `devObuzt/Afkarwts`, and a volume mounted at `/app/data`.

- [ ] **Step 3: Set the variables**

Copy every variable from the production service **except** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (the copied database holds four live staff device tokens) and the `RAILWAY_*` variables, which Railway sets itself. Then override:

| Variable | Value |
|----------|-------|
| `DRY_RUN` | `1` |
| `WHATSAPP_VERIFY_TOKEN` | a fresh random string, different from production's |
| `SMS_PROVIDER` | `none` |
| `APP_DATA_DIR` | `/app/data` |

Read the values through the Railway API into the staging service directly. Do not write them to a file.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are copied unchanged: the chat is ours, not Afkar's (settled 2026-09-13). Staging reports land in our own Telegram, marked as a simulation by the guard, and nobody at Afkar sees them.

- [ ] **Step 4: Load the database**

Copy `~/Documents/connec-clients/afkar/heartbeat/backups/app_2026-09-09_1629.sqlite` onto the staging volume as `/app/data/app.sqlite`. Then verify on staging:

```sql
PRAGMA integrity_check;
SELECT COUNT(*) FROM members;   -- expect 3950
SELECT COUNT(*) FROM messages;  -- expect 4816
```

- [ ] **Step 5: Prove the guard on the real deployment**

This is the gate for the whole plan. On the staging URL:

1. The boot log contains `Outbound disabled — no WhatsApp, SMS or push will leave this process.`
2. Send a message to any member from the UI. The message row appears with a `dryrun.` id, and nothing arrives on the real phone.
3. `POST /api/dev/simulate?key=<staging token>` with `{"type":"incoming","memberId":<id>,"text":"فحص"}` puts an incoming message in that member's thread.
4. `POST` the same to **production's** URL returns 404.

If any of the four fails, stop and fix it before Task 6.

- [ ] **Step 6: Write it down**

`docs/staging.md`: the staging URL, the project name, which variables differ from production, the database snapshot's date, and the four checks above with their results.

- [ ] **Step 7: Commit**

```bash
git add docs/staging.md
git commit -m "docs: record the staging deployment and its safety checks"
git push
```

---

### Task 6: Schema and store

**Files:**
- Create: `app/lib/journeys/schema.ts`
- Create: `app/lib/journeys/store.ts`
- Modify: `app/lib/db.ts` (call the migration inside `getDb`)
- Create: `tests/journeys-store.test.ts`

**Interfaces:**
- Produces, from `app/lib/journeys/schema.ts`: `migrateJourneyTables(db: DatabaseSync): void`.
- Produces, from `app/lib/journeys/store.ts`, the types `JourneyTemplate`, `JourneyStep`, `Journey`, `Enrollment`, and:
  - `createTemplate(input: { name: string; smsText?: string }): JourneyTemplate`
  - `listTemplates(): JourneyTemplate[]`
  - `updateTemplate(id: number, input: { name?: string; smsText?: string }): JourneyTemplate`
  - `archiveTemplate(id: number): void`
  - `createStep(input: { templateId: number; week: number; weekday: number; sendTime: string; label?: string; freeText?: string; templateName: string; templateLanguage: string; bodyParams: string[]; templatePreview: string }): JourneyStep`
  - `listSteps(templateId: number): JourneyStep[]` — ordered by week, then weekday, then time; archived steps excluded
  - `updateStep(id: number, input: Partial<Omit<JourneyStep, "id" | "templateId">>): JourneyStep`
  - `archiveStep(id: number): void`
  - `createJourney(input: { templateId: number; groupId: number; anchorDate: string }): Journey`
  - `getJourney(id: number): Journey | null`
  - `listJourneys(): Journey[]`
  - `setJourneyStatus(id: number, status: Journey["status"]): void`
  - `listActiveJourneys(): Journey[]`

- [ ] **Step 1: Write the migration**

`app/lib/journeys/schema.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";

export function migrateJourneyTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journey_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sms_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS journey_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      week INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      send_time TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      free_text TEXT NOT NULL DEFAULT '',
      template_name TEXT NOT NULL,
      template_language TEXT NOT NULL DEFAULT 'ar',
      body_params TEXT NOT NULL DEFAULT '[]',
      template_preview TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT,
      FOREIGN KEY (template_id) REFERENCES journey_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      anchor_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'done')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      activated_at TEXT,
      FOREIGN KEY (template_id) REFERENCES journey_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journey_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'stopped', 'completed', 'removed')),
      stop_reason TEXT,
      stopped_at TEXT,
      enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (journey_id, member_id),
      FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journey_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      step_id INTEGER NOT NULL,
      channel TEXT,
      message_id INTEGER,
      state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed', 'deferred', 'missed', 'skipped')),
      error TEXT,
      attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (enrollment_id, step_id),
      FOREIGN KEY (enrollment_id) REFERENCES journey_enrollments(id) ON DELETE CASCADE,
      FOREIGN KEY (step_id) REFERENCES journey_steps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      enrollment_id INTEGER,
      kind TEXT NOT NULL CHECK (kind IN ('sms', 'manual')),
      reason TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL CHECK (state IN ('queued', 'sent', 'failed', 'open', 'done')),
      body TEXT NOT NULL DEFAULT '',
      provider_ref TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (enrollment_id) REFERENCES journey_enrollments(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_journey_sends_enrollment ON journey_sends(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_journey_state ON journey_enrollments(journey_id, state);
    CREATE INDEX IF NOT EXISTS idx_followups_state ON followups(kind, state);
  `);
}
```

- [ ] **Step 2: Wire the migration in**

In `app/lib/db.ts`, import it and add the call in `getDb` after `migrateAudioMessageType(db);`:

```ts
    migrateJourneyTables(db);
```

- [ ] **Step 3: Write the failing test**

`tests/journeys-store.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("a template keeps its steps in schedule order", async () => {
  const { createTemplate, createStep, listSteps } = await import("@/app/lib/journeys/store");

  const template = createTemplate({ name: "كلين" });
  const base = { templateId: template.id, templateName: "clean_week", templateLanguage: "ar", bodyParams: [], templatePreview: "" };
  createStep({ ...base, week: 2, weekday: 2, sendTime: "19:30" });
  createStep({ ...base, week: 1, weekday: 0, sendTime: "07:00" });

  const steps = listSteps(template.id);
  assert.deepEqual(
    steps.map((step) => [step.week, step.weekday, step.sendTime]),
    [[1, 0, "07:00"], [2, 2, "19:30"]]
  );
});

test("an archived step disappears from the list but keeps its row", async () => {
  const { createTemplate, createStep, archiveStep, listSteps } = await import("@/app/lib/journeys/store");

  const template = createTemplate({ name: "أرشيف" });
  const step = createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    templateName: "t",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: ""
  });

  archiveStep(step.id);
  assert.equal(listSteps(template.id).length, 0);
});

test("a journey starts as a draft", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createTemplate, createJourney, getJourney } = await import("@/app/lib/journeys/store");

  const group = createGroup("كلين 232");
  const template = createTemplate({ name: "كلين" });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });

  assert.equal(getJourney(journey.id)?.status, "draft");
});
```


- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/journeys/store'`.

- [ ] **Step 5: Write the store**

`app/lib/journeys/store.ts` implements the interfaces listed above. Rules to follow:
- Every function reaches SQLite through the same `getDb()` connection used by `app/lib/db.ts`. Export a `getDb` from `app/lib/db.ts` if it is not already exported, rather than opening a second connection.
- `body_params` is stored as JSON text and mapped to `string[]`.
- `listSteps` filters `archived_at IS NULL` and orders by `week, weekday, send_time`.
- `archiveStep` and `archiveTemplate` set `archived_at`; neither deletes.
- Map snake_case columns to camelCase fields, the same way `app/lib/db.ts` does.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/lib/journeys/ app/lib/db.ts tests/journeys-store.test.ts
git commit -m "feat: add the journeys schema and store"
```

---
### Task 7: Due-time arithmetic

A step is written as week N, weekday and time in `Asia/Jerusalem` (§6.1). This task turns that into an instant, correctly across a daylight-saving change.

**Files:**
- Create: `app/lib/journeys/schedule.ts`
- Create: `tests/journeys-schedule.test.ts`

**Interfaces:**
- Produces: `stepDueAt(anchorDate: string, step: { week: number; weekday: number; sendTime: string }): Date` — `anchorDate` is `YYYY-MM-DD`, `sendTime` is `HH:MM`.
- Produces: `jerusalemToUtc(dateIso: string, time: string): Date`.

- [ ] **Step 1: Write the failing test**

`tests/journeys-schedule.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { stepDueAt } from "@/app/lib/journeys/schedule";

// 2026-08-30 is a Sunday, in Israel Daylight Time (UTC+3).
test("week 1 on the anchor's own weekday is the anchor day", () => {
  const due = stepDueAt("2026-08-30", { week: 1, weekday: 0, sendTime: "07:00" });
  assert.equal(due.toISOString(), "2026-08-30T04:00:00.000Z");
});

test("week 2 counts seven days on from the anchor's week", () => {
  const due = stepDueAt("2026-08-30", { week: 2, weekday: 2, sendTime: "19:30" });
  assert.equal(due.toISOString(), "2026-09-08T16:30:00.000Z");
});

test("a weekday before the anchor's falls later in the same week", () => {
  // The anchor is a Tuesday, so week 1's Sunday is the Sunday that follows it.
  const due = stepDueAt("2026-09-01", { week: 1, weekday: 0, sendTime: "07:00" });
  assert.equal(due.toISOString(), "2026-09-06T04:00:00.000Z");
});

test("07:00 stays 07:00 after daylight saving ends", () => {
  // Israel leaves daylight saving on 2026-10-25.
  const before = stepDueAt("2026-10-18", { week: 1, weekday: 0, sendTime: "07:00" });
  const after = stepDueAt("2026-10-18", { week: 3, weekday: 0, sendTime: "07:00" });

  assert.equal(before.toISOString(), "2026-10-18T04:00:00.000Z");
  assert.equal(after.toISOString(), "2026-11-01T05:00:00.000Z");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/journeys/schedule'`.

- [ ] **Step 3: Implement it**

`app/lib/journeys/schedule.ts`:

```ts
const TIME_ZONE = "Asia/Jerusalem";
const DAY_MS = 24 * 60 * 60 * 1000;

/** How far Asia/Jerusalem is from UTC, in minutes, at a given instant. */
function zoneOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = value("hour") === 24 ? 0 : value("hour");
  const asIfUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));

  return (asIfUtc - instant.getTime()) / 60000;
}

/** The instant named by a wall-clock date and time in Asia/Jerusalem. */
export function jerusalemToUtc(dateIso: string, time: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  const firstGuess = new Date(naive - zoneOffsetMinutes(new Date(naive)) * 60000);
  // The offset is read again at the instant found, because the first reading
  // can come from the wrong side of a daylight-saving change.
  return new Date(naive - zoneOffsetMinutes(firstGuess) * 60000);
}

export function stepDueAt(anchorDate: string, step: { week: number; weekday: number; sendTime: string }) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  const intoWeek = (step.weekday - new Date(anchor).getUTCDay() + 7) % 7;
  const dayIso = new Date(anchor + ((step.week - 1) * 7 + intoWeek) * DAY_MS).toISOString().slice(0, 10);

  return jerusalemToUtc(dayIso, step.sendTime);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, all four.

- [ ] **Step 5: Commit**

```bash
git add app/lib/journeys/schedule.ts tests/journeys-schedule.test.ts
git commit -m "feat: work out a step's send time in Asia/Jerusalem"
```

---

### Task 8: The rules

The whole of §7 as one pure function. No database, no network — this is where the rules are proven.

**Files:**
- Create: `app/lib/journeys/engine.ts`
- Create: `tests/journeys-engine.test.ts`

**Interfaces:**
- Produces, from `app/lib/journeys/engine.ts`:

```ts
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
  dueSteps: PendingStep[];      // window open, no journey_sends row yet
  expiredSteps: PendingStep[];  // window closed, no journey_sends row yet
  hasUnsentStepsAhead: boolean;
};

export type Action =
  | { kind: "send"; enrollmentId: number; stepId: number; channel: "text" | "template" }
  | { kind: "defer"; enrollmentId: number; stepId: number }
  | { kind: "missed"; enrollmentId: number; stepId: number }
  | { kind: "stop"; enrollmentId: number; reason: "not_delivered" | "not_read" | "send_failed" }
  | { kind: "complete"; enrollmentId: number };

export const FREE_TEXT_WINDOW_MS: number;  // 23h50m
export const SILENCE_MS: number;           // 48h
export const SEND_WINDOW_MS: number;       // 12h

export function planTick(input: { now: Date; allowance: number; enrollments: EnrollmentState[] }): Action[];
```

- [ ] **Step 1: Write the failing test**

`tests/journeys-engine.test.ts`:

```ts
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

test("an undeliverable number stops at once, without waiting 48 hours", () => {
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

  assert.deepEqual(actions, [{ kind: "stop", enrollmentId: 1, reason: "send_failed" }]);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/journeys/engine'`.

- [ ] **Step 3: Implement the rules**

`app/lib/journeys/engine.ts`, carrying the types from the Interfaces block above, then:

```ts
import { classifyFailure } from "../whatsapp-errors";

export const FREE_TEXT_WINDOW_MS = (23 * 60 + 50) * 60 * 1000;
export const SILENCE_MS = 48 * 60 * 60 * 1000;
export const SEND_WINDOW_MS = 12 * 60 * 60 * 1000;

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
    return classifyFailure(last.error).kind === "undeliverable"
      ? { kind: "stop", enrollmentId: enrollment.enrollmentId, reason: "send_failed" }
      : null;
  }

  const silentFor = now.getTime() - new Date(last.attemptedAt).getTime();
  const repliedAfter =
    enrollment.lastIncomingAt !== null &&
    new Date(enrollment.lastIncomingAt).getTime() > new Date(last.attemptedAt).getTime();

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
    const lastSendSettled =
      enrollment.lastSend !== null &&
      input.now.getTime() - new Date(enrollment.lastSend.attemptedAt).getTime() >= SILENCE_MS;

    if (nothingLeft && lastSendSettled) {
      actions.push({ kind: "complete", enrollmentId: enrollment.enrollmentId });
    }
  }

  return actions;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, all fifteen engine tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/journeys/engine.ts tests/journeys-engine.test.ts
git commit -m "feat: decide each tick's sends and stops as a pure function"
```

---

### Task 9: Running a tick

The I/O half: read the state, call `planTick`, carry out the actions, and expose the tick.

**Files:**
- Modify: `app/lib/journeys/store.ts`
- Create: `app/lib/journeys/runner.ts`
- Create: `app/api/journeys/tick/route.ts`
- Modify: `app/lib/scheduler.ts`
- Create: `tests/journeys-runner.test.ts`

**Interfaces:**
- Adds to `app/lib/journeys/store.ts`:
  - `syncEnrollments(journeyId: number, now: Date): { added: number; removed: number }` — enrols every group member without an enrollment, recording steps already past for them as `skipped`; marks an enrollment `removed` when the member has left the group.
  - `loadTickState(journeyId: number, now: Date): EnrollmentState[]` — a step is a `dueStep` while `dueAt <= now < dueAt + SEND_WINDOW_MS` with no `journey_sends` row, and an `expiredStep` once `now >= dueAt + SEND_WINDOW_MS` with no row.
  - `getStep(id: number): JourneyStep | null`
  - `claimSend(enrollmentId: number, stepId: number): number | null` — inserts a `pending` row and returns its id, or `null` when one already exists.
  - `recordSend(sendId: number, input: { channel: "text" | "template"; messageId: number | null; state: "sent" | "failed"; error?: string | null }): void`
  - `recordSendState(enrollmentId: number, stepId: number, state: "deferred" | "missed" | "skipped"): void`
  - `markEditedStepSkipped(stepId: number, now: Date): void` — called by `updateStep`. When an edit moves a step's due time into the past, it records a `skipped` row for every active enrollment with no row for that step (spec §5), so an edit never fires a step on the spot and never looks like an outage. It lives here rather than in Task 6 because it needs both enrollments and `stepDueAt`.
  - `stopEnrollment(enrollmentId: number, reason: string, now: Date): void`
  - `completeEnrollment(enrollmentId: number): void`
  - `remainingAllowance(now: Date): Promise<number>` — `getMessagingLimit().dailyLimit` minus the distinct members who received an outgoing message in the last 24 hours.
- Produces, from `app/lib/journeys/runner.ts`: `runDueJourneys(now?: Date): Promise<{ sent: number; failed: number; stopped: number; deferred: number }>`.

- [ ] **Step 1: Write the failing test**

`tests/journeys-runner.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";

async function cohort() {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  const group = createGroup(`كلين ${Date.now()}`);
  const member = createMember({ name: "سارة", phone: `+97250${String(Date.now()).slice(-7)}`, notes: "" });
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: "كلين" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    freeText: "مراحب يا رفاق",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  return { journey, member };
}

test("a due step is sent once, however many ticks run", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listMessages } = await import("@/app/lib/db");
  const { member } = await cohort();

  const now = new Date("2026-08-30T05:00:00.000Z"); // an hour after 07:00 Israel time
  await runDueJourneys(now);
  await runDueJourneys(now);

  const messages = listMessages(member.id).filter((message) => message.direction === "outgoing");
  assert.equal(messages.length, 1);
  assert.match(messages[0].whatsappMessageId ?? "", /^dryrun\./);
});

test("a step whose window closed is recorded missed, not sent", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listMessages } = await import("@/app/lib/db");
  const { member } = await cohort();

  await runDueJourneys(new Date("2026-08-31T05:00:00.000Z")); // a full day late
  assert.equal(listMessages(member.id).length, 0);
});
```


- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/journeys/runner'`.

- [ ] **Step 3: Write `claimSend`**

This is what makes a send happen at most once, so it is written exactly:

```ts
export function claimSend(enrollmentId: number, stepId: number) {
  try {
    const result = getDb()
      .prepare("INSERT INTO journey_sends (enrollment_id, step_id, state) VALUES (?, ?, 'pending')")
      .run(enrollmentId, stepId);
    return Number(result.lastInsertRowid);
  } catch {
    // The unique key on (enrollment_id, step_id) rejected it: another tick, or
    // an earlier one that died mid-send, already owns this step.
    return null;
  }
}
```

- [ ] **Step 4: Write the runner**

`app/lib/journeys/runner.ts`:

```ts
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

export async function runDueJourneys(now = new Date()) {
  const totals = { sent: 0, failed: 0, stopped: 0, deferred: 0 };

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
          if (action.kind === "defer") {
            totals.deferred += 1;
          }
          continue;
        }

        // Claim first: the unique key on (enrollment_id, step_id) means a second
        // tick cannot send the same step, even if this one dies mid-send.
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
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Add the tick endpoint**

`app/api/journeys/tick/route.ts`, modelled on `app/api/campaigns/tick/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runDueJourneys } from "@/app/lib/journeys/runner";
import { isLive } from "@/app/lib/outbound-guard";
import "@/app/lib/scheduler";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Time travel exists only where nothing can be sent.
  const nowParam = isLive() ? null : url.searchParams.get("now");
  const totals = await runDueJourneys(nowParam ? new Date(nowParam) : new Date());

  return NextResponse.json({ ok: true, ...totals });
}
```

- [ ] **Step 7: Run it every five minutes**

In `app/lib/scheduler.ts`, inside the existing started block, importing `runDueJourneys`:

```ts
  const journeyTick = () => {
    runDueJourneys().catch((error) => console.error("Journey scheduler tick failed:", error));
  };

  setTimeout(journeyTick, 30 * 1000);
  setInterval(journeyTick, 5 * 60 * 1000);
```

- [ ] **Step 8: Verify and commit**

Run: `npm run build && npm test`

```bash
git add app/lib/journeys/ app/api/journeys/ app/lib/scheduler.ts tests/journeys-runner.test.ts
git commit -m "feat: run a journey tick and send its due steps"
```

---

### Task 10: SMS and follow-up

**Files:**
- Create: `app/lib/sms.ts`
- Create: `app/lib/journeys/followups.ts`
- Modify: `app/lib/journeys/runner.ts` (open follow-ups on a stop, drain the queue)
- Create: `tests/followups.test.ts`

**Interfaces:**
- Produces, from `app/lib/sms-format.ts` (pure, no imports — Task 12 imports it into a client component): `isIsraeliMobile(phone: string): boolean`, `smsSegments(body: string): { characters: number; segments: number }`.
- Produces, from `app/lib/sms.ts`: `sendSms(phone: string, body: string): Promise<{ providerRef: string }>`.
- Produces, from `app/lib/journeys/followups.ts`, the type `Followup = { id: number; memberId: number; enrollmentId: number | null; kind: "sms" | "manual"; reason: string; state: "queued" | "sent" | "failed" | "open" | "done"; body: string; providerRef: string | null; attempts: number; error: string | null; note: string; createdAt: string; resolvedAt: string | null }`.
- Produces, from `app/lib/journeys/followups.ts`: `openFollowupsForStop(input: { enrollmentId: number; memberId: number; reason: string; smsText: string }): void`, `listFollowups(filter?: { kind?: "sms" | "manual"; state?: string }): Followup[]`, `drainSmsQueue(now: Date): Promise<{ sent: number; failed: number; held: number }>`, `resolveManual(id: number, note: string): void`, `resumeEnrollment(followupId: number): void`.

- [ ] **Step 1: Write the failing test**

`tests/followups.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("Israeli mobiles are recognised and others are not", async () => {
  const { isIsraeliMobile } = await import("@/app/lib/sms-format");

  assert.equal(isIsraeliMobile("+972526805262"), true);
  assert.equal(isIsraeliMobile("972526805262"), true);
  assert.equal(isIsraeliMobile("+970598123456"), false);
  assert.equal(isIsraeliMobile("+97226805262"), false); // a landline
});

test("Arabic text is counted at 70 characters per message", async () => {
  const { smsSegments } = await import("@/app/lib/sms-format");

  assert.deepEqual(smsSegments("مرحبا"), { characters: 5, segments: 1 });
  assert.equal(smsSegments("ا".repeat(70)).segments, 1);
  assert.equal(smsSegments("ا".repeat(71)).segments, 2);
  assert.equal(smsSegments("a".repeat(160)).segments, 1);
  assert.equal(smsSegments("a".repeat(161)).segments, 2);
});

test("a stop opens a manual task, and an SMS item only for an Israeli mobile", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups } = await import("@/app/lib/journeys/followups");

  const israeli = createMember({ name: "سارة", phone: "+972526805262", notes: "" });
  const palestinian = createMember({ name: "ليلى", phone: "+970598123456", notes: "" });

  openFollowupsForStop({ enrollmentId: 1, memberId: israeli.id, reason: "not_read", smsText: "تواصلي معنا" });
  openFollowupsForStop({ enrollmentId: 2, memberId: palestinian.id, reason: "not_read", smsText: "تواصلي معنا" });

  const manual = listFollowups({ kind: "manual" });
  const sms = listFollowups({ kind: "sms" });

  assert.equal(manual.length, 2);
  assert.equal(sms.length, 1);
  assert.equal(sms[0].memberId, israeli.id);
  assert.ok(manual.find((item) => item.memberId === palestinian.id)?.reason.includes("مش إسرائيلي"));
});

test("the queue is held outside sending hours", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, drainSmsQueue } = await import("@/app/lib/journeys/followups");

  const member = createMember({ name: "هدى", phone: "+972526805263", notes: "" });
  openFollowupsForStop({ enrollmentId: 3, memberId: member.id, reason: "not_read", smsText: "تواصلي معنا" });

  const night = await drainSmsQueue(new Date("2026-09-13T01:00:00.000Z")); // 04:00 Israel time
  assert.equal(night.sent, 0);
  assert.equal(night.held, 1);

  const day = await drainSmsQueue(new Date("2026-09-13T09:00:00.000Z")); // 12:00 Israel time
  assert.equal(day.sent, 1); // SMS_PROVIDER is unset, so this is a simulated send
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/sms-format'`.

- [ ] **Step 3: Write the SMS module**

`app/lib/sms-format.ts` — pure, with no imports, so the editor in Task 12 can use
it in a client component without pulling server code into the browser bundle:

```ts
const GSM_SINGLE = 160;
const GSM_MULTI = 153;
const UNICODE_SINGLE = 70;
const UNICODE_MULTI = 67;

/** Israeli mobiles are 05X followed by seven digits: +9725XXXXXXXX. */
export function isIsraeliMobile(phone: string) {
  return /^9725\d{8}$/.test(phone.replace(/[^\d]/g, ""));
}

/** Arabic and Hebrew force UCS-2, which fits far less per message than Latin. */
export function smsSegments(body: string) {
  const characters = [...body].length;
  const unicode = /[^ -~\r\n]/.test(body);
  const single = unicode ? UNICODE_SINGLE : GSM_SINGLE;
  const multi = unicode ? UNICODE_MULTI : GSM_MULTI;

  return { characters, segments: characters <= single ? 1 : Math.ceil(characters / multi) };
}
```

`app/lib/sms.ts`:

```ts
import { dryRunId, isLive } from "./outbound-guard";

export async function sendSms(phone: string, body: string) {
  const provider = process.env.SMS_PROVIDER ?? "none";

  if (provider === "none" || !isLive()) {
    return { providerRef: dryRunId("sms") };
  }

  // Inforu authenticates only on a complete Basic header, and reports the real
  // failure in the body of an HTTP 400 rather than in the status line.
  const response = await fetch("https://uapi.inforu.co.il/SendMessageXml.ashx", {
    method: "POST",
    headers: {
      Authorization: process.env.INFORU_AUTH ?? "",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ InforuXML: buildInforuXml(phone, body) })
  });

  const text = await response.text();
  const status = /<StatusId>(-?\d+)<\/StatusId>/.exec(text)?.[1];

  if (status !== "1") {
    throw new Error(`Inforu refused the message (StatusId ${status ?? "unknown"}): ${text.slice(0, 200)}`);
  }

  return { providerRef: /<MessageId>(\d+)<\/MessageId>/.exec(text)?.[1] ?? "inforu" };
}
```

Write `buildInforuXml` from the working call in the LegaliSync repo — search it for `INFORU_AUTH` — and not from memory; the request shape and the sender rules are already proven there. Until Afkar's credentials arrive, `SMS_PROVIDER` stays `none` and this branch never runs.

- [ ] **Step 4: Write the follow-ups module**

`app/lib/journeys/followups.ts` implements the interfaces above. Rules:

- `openFollowupsForStop` always inserts one `manual` row in state `open`, with the Arabic reason from §9:
  - `not_delivered` gives `الرسالة ما وصلت لجهازه خلال يومين`
  - `not_read` gives `وصلت وما انقرأت خلال يومين`
  - `send_failed` gives `الرقم ما بيستقبل واتساب — أو كود الدولة غلط`, plus ` · جرّب <alternate>` when `alternateCountryCode(phone)` from `app/lib/whatsapp-errors.ts` returns a number
  - when `isIsraeliMobile(phone)` is false, append ` · رقم مش إسرائيلي — ما بيدخل طابور SMS`
- It inserts one `sms` row in state `queued` **only** when `isIsraeliMobile(phone)` is true and `smsText` is not empty.
- `drainSmsQueue` sends `queued` rows only between 09:00 and 20:00 Israel time — read the hour with `Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false })` — and returns the rest in `held`. Each row gets one attempt per call, `attempts` is incremented, and at 3 attempts the row becomes `failed` carrying the provider's error.
- `resumeEnrollment` sets the enrollment back to `active` and closes the manual task.

- [ ] **Step 5: Wire it into the runner**

In `app/lib/journeys/runner.ts`, in the `stop` branch, after `stopEnrollment`:

```ts
          openFollowupsForStop({
            enrollmentId: action.enrollmentId,
            memberId: memberIdByEnrollment.get(action.enrollmentId) ?? 0,
            reason: action.reason,
            smsText: templateSmsText
          });
```

where `templateSmsText` is the `smsText` of the journey's template, read once per journey. At the end of `runDueJourneys`, before returning, `await drainSmsQueue(now)` and fold its totals into the result.

- [ ] **Step 6: Run the tests**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/lib/sms-format.ts app/lib/sms.ts app/lib/journeys/followups.ts app/lib/journeys/runner.ts tests/followups.test.ts
git commit -m "feat: queue SMS and open manual tasks when a member stops"
```

---

### Task 11: Reporting

**Files:**
- Create: `app/lib/journeys/report.ts`
- Modify: `app/lib/journeys/runner.ts` (Telegram after a tick)
- Create: `app/api/journeys/digest/route.ts`
- Create: `tests/journeys-report.test.ts`

**Interfaces:**
- Produces, from `app/lib/journeys/report.ts`:
  - `journeyFunnel(journeyId: number): { enrolled: number; sent: number; reached: number; read: number; replied: number; stopped: Record<string, number>; repliedAfterStop: number; sms: Record<string, number>; manual: Record<string, number> }`
  - `stepBreakdown(journeyId: number): Array<{ stepId: number; label: string; dueAt: string; sentText: number; sentTemplate: number; failed: number; deferred: number; missed: number; skipped: number; stuck: number; delivered: number; read: number; replied: number }>` — `stuck` counts `journey_sends` rows still in state `pending` more than ten minutes after `attempted_at`, which means a process died between claiming a step and recording it (spec §7.2). They are never resent.
  - `formatTickReport(input: { journeyName: string; groupName: string; stepLabel: string; sentText: number; sentTemplate: number; failed: number; deferred: number; stopped: number }): string`
  - `formatDailyDigest(journeyId: number): string`

- [ ] **Step 1: Write the failing test**

`tests/journeys-report.test.ts` builds one journey with two members, runs a tick, then feeds statuses in through `handleWebhookPayload(buildStatusPayload(...))` — one member `read` and replying, one left at `sent` and stopped after 48 hours — and asserts the funnel:

```ts
test("the funnel counts each member once, by their best outcome", async () => {
  // … build the cohort, tick, simulate statuses and a reply, tick again 49h later …
  const { journeyFunnel } = await import("@/app/lib/journeys/report");
  const funnel = journeyFunnel(journey.id);

  assert.equal(funnel.enrolled, 2);
  assert.equal(funnel.sent, 2);
  assert.equal(funnel.reached, 1);
  assert.equal(funnel.read, 1);
  assert.equal(funnel.replied, 1);
  assert.deepEqual(funnel.stopped, { not_delivered: 1 });
  assert.equal(funnel.manual.open, 1);
});
```

The definitions are §10.1 exactly: `reached` counts members with at least one journey message `delivered` or `read`; `read` counts members with at least one `read`; `replied` counts members with an incoming message after their first journey send.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/lib/journeys/report'`.

- [ ] **Step 3: Implement the report**

Write `app/lib/journeys/report.ts` to those definitions, one query per funnel row, joining `journey_enrollments` to `journey_sends` to `messages`. A member counts once per row, never once per message.

- [ ] **Step 4: Report after each tick**

In `runDueJourneys`, when a journey produced any send, stop or failure, call `sendTelegramMessage(formatTickReport(...))` with:

```
📤 مسار «<اسم المسار>» · <اسم المجموعة>
الخطوة: <label>
انبعت: <n> (<t> نص حر · <p> قالب)
فشل: <n> · مؤجل: <n>
وقفوا: <n>
```

`sendTelegramMessage` already marks the text as a simulation when not live, so staging needs nothing extra.

- [ ] **Step 5: Add the daily digest**

`app/api/journeys/digest/route.ts`, with the same key check as the tick, sends `formatDailyDigest` for every active journey:

```
📊 مسار «<اسم>» — ملخص اليوم
ردّوا: <n>
وقفوا: <n> (<سبب>: <n> · <سبب>: <n>)
SMS: <n> انبعتت · <n> بالطابور · <n> فشلت
مهام يدوية مفتوحة: <n> · أقدم وحدة من <n> يوم
```

It also sends an alert when a step's failures pass 20% of its sends, or when any step is `missed`. Schedule a 20:00 Israel-time call from the machine that runs the other scheduled tasks.

- [ ] **Step 6: Run the tests and commit**

Run: `npm run build && npm test`

```bash
git add app/lib/journeys/report.ts app/lib/journeys/runner.ts app/api/journeys/digest/ tests/journeys-report.test.ts
git commit -m "feat: report each journey's funnel, steps and daily digest"
```

---

### Task 12: The screens

**Files:**
- Create: `app/api/journeys/templates/route.ts`, `app/api/journeys/templates/[id]/steps/route.ts`, `app/api/journeys/route.ts`, `app/api/journeys/[id]/route.ts`, `app/api/journeys/[id]/report/route.ts`, `app/api/journeys/followups/route.ts`, `app/api/journeys/followups/[id]/route.ts`
- Create: `app/journeys/JourneysTab.tsx`, `app/journeys/TemplateEditor.tsx`, `app/journeys/JourneyView.tsx`, `app/journeys/FollowupList.tsx`
- Modify: `app/page.tsx` (add the tab only)

**Interfaces:**
- Consumes: everything exported from `app/lib/journeys/store.ts` and `app/lib/journeys/report.ts`.
- The components never import `app/lib/journeys/*` directly; they call the routes above.

- [ ] **Step 1: Add the API routes**

Each route is a thin wrapper over one store function, following the shape of `app/api/campaigns/route.ts`: the same session check that file uses, parse the body, call the store, return JSON. `GET /api/journeys/[id]/report` returns `{ funnel, steps }` from `report.ts`. `POST /api/journeys/followups/[id]` handles both `{ action: "resolve", note }` and `{ action: "resume" }`.

- [ ] **Step 2: Build the template editor**

`TemplateEditor.tsx` — the step list, each row carrying `أسبوع <n>`, a weekday select (`الأحد` … `السبت`), a time input, a label, a free-text area, and the existing template picker from `app/page.tsx` (which already shows each template's category). One SMS field for the whole template, with a live counter:

```tsx
import { smsSegments } from "@/app/lib/sms-format";

const { characters, segments } = smsSegments(smsText);

<p className="hint">
  {characters} حرف · {segments} {segments === 1 ? "رسالة" : "رسائل"} SMS
</p>
```

- [ ] **Step 3: Build the journey view**

`JourneyView.tsx` — the group, the anchor date, the calendar of real send times from `stepDueAt`, the funnel of §10.1, the per-step table, and the member list filtered by state, each row opening the existing chat view.

- [ ] **Step 4: Build the follow-up list**

`FollowupList.tsx` — the SMS queue with its state badges (`بانتظار كريدز أفكار بـInforu` while `SMS_PROVIDER` is `none`), and the manual tasks with their reason, a note field, `تم التواصل` and `رجّعه للمسار`.

- [ ] **Step 5: Add the tab**

In `app/page.tsx`, add `المسارات` to the existing tab set and render `<JourneysTab />`. Nothing else in that file changes.

- [ ] **Step 6: Walk it through on staging**

Create a template, add two steps, attach it to `internal testers` with today's date, check the calendar, activate, run a tick, and watch the funnel move.

- [ ] **Step 7: Commit**

```bash
git add app/api/journeys/ app/journeys/ app/page.tsx
git commit -m "feat: add the journeys screens"
git push
```

---

### Task 13: A full cohort, simulated

The last gate (§11). Nothing is called working until this run matches a funnel worked out by hand beforehand.

**Files:**
- Create: `docs/staging-run-2026-09.md`

- [ ] **Step 1: Predict the result**

Copy the `كلين 232 - 30.08` group on staging. Pick 10 members and write down, before running anything, what each should receive and what the funnel must read at the end: who replies inside the window and gets free text, who replies late and gets the template, who reads without replying and stays, whose message never arrives and stops at 48 hours, and who has a `+970` number and gets a manual task with no SMS item.

- [ ] **Step 2: Run three weeks**

Step `?now=` through the cohort in order, calling `/api/journeys/tick?key=…&now=…`, injecting replies and statuses through `/api/dev/simulate` between ticks.

- [ ] **Step 3: Compare**

Put the predicted and the actual funnel side by side in `docs/staging-run-2026-09.md`. Every difference is either a bug or a rule written down wrong — say which, and fix it.

- [ ] **Step 4: Check the guard once more**

Confirm that across the whole run every outgoing message id starts with `dryrun.`, and that Afkar's real number sent nothing. Record the check and its result in the same file.

- [ ] **Step 5: Commit**

```bash
git add docs/staging-run-2026-09.md
git commit -m "docs: record the simulated cohort run and its funnel"
git push
```
