# Afkar Journeys Design

Scheduled, reply-aware message paths for cohort groups — built and tested on a
separate staging deployment, with nothing sent to real contacts.

- **Date:** 2026-09-11
- **Branch:** `journeys` (production deploys from `main`)
- **Scope of this spec:** staging only. Shipping to production is an open
  decision (§13).

## 1. Goal

When Afkar opens a new cohort group — for example `كلين 232 - 30.08`, 239
members starting together on 30.08 — the whole message schedule for that cohort
runs by itself:

- Each step goes out on its day and hour ("week 1 · Sunday · 07:00").
- A member who wrote to us in the last 24 hours gets the step as rich free text
  (emoji, tone, the full original wording). Everyone else gets the step's
  approved utility template.
- A member the messages stop reaching is taken out of the path, queued for SMS,
  and put on a manual follow-up list with the exact reason.
- Every outcome is visible per cohort, per step and per member.

**Why now.** Every cohort message today is a manual bulk send. The backup shows
the cost: the same Clean welcome went to group 3 twice — 208 delivered the
first time, and 10 delivered / 224 failed the second time, when it went as free
text outside the 24-hour window (campaigns 8 and 9).

## 2. Non-goals

- Any change to production: `afkarheartbeat.com`, the `Afkarwts` Railway
  project, its webhook, or the `main` branch.
- Timing anchored on each member's own join date. Cohort start date only.
- Media inside steps. Steps are text and templates.
- Opt-out keyword handling.
- Real WhatsApp sends, or a real Meta webhook, on staging.
- Setting up Afkar's Inforu account (credentials arrive later).
- Replacing campaigns. Campaigns keep working exactly as they do.

## 3. Decisions taken in brainstorming

| # | Decision |
|---|----------|
| D1 | Staging sends nothing. Full dry run, plus a test endpoint that simulates replies and delivery statuses. |
| D2 | Step timing is anchored on the cohort's start date. Everyone in the group moves together. |
| D3 | Channel is chosen per send: last incoming message less than 24h old → free text; otherwise → utility template. |
| D4 | The stop rule is rolling silence: 48h since our last journey message with no incoming message after it. |
| D5 | Only unreached members stop — the last message was not delivered, or delivered and not read. A member who read and stayed silent stays in the path. |
| D6 | A path is a reusable template. It is built once and attached to each new group with that group's start date. |

## 4. Staging environment

| Item | Decision |
|------|----------|
| Railway project | New project `afkar-heartbeat-staging`, separate from `Afkarwts`. One service, one volume at `/app/data`. |
| Source | GitHub branch `journeys`. Production's active deployment is built from `main` (verified: commit `2aab49c`), so the branch cannot reach it. |
| Data | Copy of `afkar/heartbeat/backups/app_2026-09-09_1629.sqlite` (integrity check ok; 3,950 members, 4,816 messages, 11 campaigns, 3 groups, 4 devices). |
| Media | Not copied in v1 (85MB). Old messages show without attachments. |
| Domain | Railway-generated `*.up.railway.app`. No custom domain. |
| Webhook | Not registered with Meta. The test endpoint (§4.3) replaces it. |

### 4.1 Environment variables

Copied from production through the Railway API straight into the staging
service. They are never written to disk. Exceptions:

| Variable | Staging value |
|----------|---------------|
| `DRY_RUN` | `1` (new) |
| `WHATSAPP_VERIFY_TOKEN` | New random value, so a staging key cannot trigger production's tick and the reverse. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | **Not copied.** The copied database holds 4 live device tokens belonging to Afkar staff. Without these variables `sendPushToDevices` already returns `skipped`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Copied unchanged. The chat is ours, not Afkar's (settled 2026-09-13), so staging reports reach our own Telegram and nobody at Afkar sees them. |
| `SMS_PROVIDER` | `none` (new) |

### 4.2 The outbound guard — the one part that must be right

A single module, `app/lib/outbound-guard.ts`, decides whether this process may
talk to the outside world:

```ts
export const isLive = () =>
  process.env.RAILWAY_PROJECT_NAME === "Afkarwts" && process.env.DRY_RUN !== "1";
```

Sends are live **only inside the production project**. Staging, local
development and any future copy are dry by default, even if `DRY_RUN` is
forgotten.

The guard sits at the lowest layer of every outbound side effect, not in the
journeys engine:

| Function | When not live |
|----------|---------------|
| `sendWhatsAppText`, `sendWhatsAppTemplate`, `sendWhatsAppMedia`, `uploadWhatsAppMedia` | Return a synthetic id `dryrun.<uuid>`. Never call `graph.facebook.com`. |
| `sendPushToDevices` | Return `skipped`. |
| `sendSms` | Mark the item sent with `dryrun.<uuid>`. |
| `sendTelegramMessage` | Prefix the text with `🧪 ستيجينج · محاكاة`. |

Read-only calls stay live: `listWhatsAppTemplates` (the template picker needs
it), `getMessagingLimit`, and media info/download.

**Why the lowest layer.** `scheduler.ts` starts itself one minute after the
first request and runs every due campaign. The copied database has 11
campaigns. All are `done` today, but a guard placed only in the journeys engine
would not cover any campaign that becomes active on staging.

**Visibility.** When not live, the server logs
`Outbound disabled — no WhatsApp, SMS or push` at boot, and the UI shows a
permanent banner. If the production project were ever renamed, the banner would
appear on production at once instead of sends failing silently.

**Proof before the first deploy.** A test runs every exported send function with
`fetch` stubbed to throw on `graph.facebook.com`, `fcm.googleapis.com` and the
Inforu host, and asserts none of them is called.

### 4.3 Test endpoint

`POST /api/dev/simulate` — returns 404 when `isLive()`. Requires the admin
session or `?key=` with staging's verify token.

| Body | Effect |
|------|--------|
| `{ "type": "incoming", "memberId": 12, "text": "..." }` | Builds a payload in Meta's webhook shape and passes it to the same handler the webhook uses. |
| `{ "type": "status", "whatsappMessageId": "dryrun.…", "status": "delivered" }` | Same, for a status update (`sent`, `delivered`, `read`, `failed` + `error`). |

To make this possible, the webhook route's POST body handling moves into an
exported `handleWebhookPayload(payload)`. The route calls it; so does the
simulator. Webhook behaviour is unchanged.

The journeys tick accepts `?now=<ISO>` when not live, so three weeks of a cohort
can be simulated in minutes.

## 5. Data model

Six new tables. Migrations are additive (`CREATE TABLE IF NOT EXISTS`). No
existing table gains or loses a column.

**`journey_templates`** — the reusable path.
`id`, `name`, `sms_text`, `created_at`, `archived_at`

**`journey_steps`** — one message in a template.
`id`, `template_id`, `week` (≥ 1), `weekday` (0 = Sunday … 6 = Saturday),
`send_time` (`HH:MM`, Asia/Jerusalem), `label`, `free_text` (optional),
`template_name` (required), `template_language`, `body_params` (JSON),
`template_preview` (the rendered template body, stored for the message thread
and reports), `archived_at`

**`journeys`** — a template running on one group.
`id`, `template_id`, `group_id`, `anchor_date` (`YYYY-MM-DD`, Asia/Jerusalem),
`status` (`draft` | `active` | `paused` | `done`), `created_at`, `activated_at`.
One non-`done` journey per group.

**`journey_enrollments`** — one member's place in one journey.
`id`, `journey_id`, `member_id`, `state` (`active` | `stopped` | `completed` |
`removed`), `stop_reason` (`not_delivered` | `not_read` | `send_failed`),
`stopped_at`, `enrolled_at`. Unique on `(journey_id, member_id)`.

**`journey_sends`** — one attempt of one step for one member.
`id`, `enrollment_id`, `step_id`, `channel` (`text` | `template`), `message_id`
(→ `messages.id`), `state` (`pending` | `sent` | `failed` | `deferred` |
`missed` | `skipped`), `error`, `attempted_at`. **Unique on `(enrollment_id, step_id)`** —
this is the duplicate-send guard, replacing the body-text comparison campaigns
use, which breaks when the same text goes to members at different stages.

**`followups`** — SMS items and manual tasks.
`id`, `member_id`, `enrollment_id`, `kind` (`sms` | `manual`), `reason`,
`state` (`queued` | `sent` | `failed` for SMS; `open` | `done` for manual),
`body`, `provider_ref`, `attempts`, `error`, `note`, `created_at`,
`resolved_at`

**Derived, not stored.** A member's last incoming time and each message's
delivered/read state come from the existing `messages` table (`direction`,
`status`, `created_at`, indexed on `(member_id, created_at)`). The webhook needs
no journey-specific changes.

**Template edits.** Journeys read their template's steps live. Editing a step's
text or time changes it for every active journey from the next unsent send.
What was already sent is kept in `messages`. If an edit moves a step's due time
into the past for an active journey, that step is recorded `skipped` there —
never sent on the spot. A step that has sends is archived, never deleted.

## 6. Scheduling

### 6.1 Due time

A step is written as week N, weekday, and time. Week N covers the seven days
`[anchor + 7(N−1), anchor + 7N)`. The step's day is the day in that span with
the chosen weekday.

Example, anchor 2026-08-30 (a Sunday):

- Week 1 · Sunday · 07:00 → 2026-08-30 07:00 Israel time
- Week 2 · Tuesday · 19:30 → 2026-09-08 19:30 Israel time

Due times are computed on the fly from the journey's anchor and the step, with
`Intl` in `Asia/Jerusalem`, so daylight-saving changes land on the right hour.
They are compared in UTC.

The journey page shows the full calendar — every step with its real date —
before activation.

### 6.2 Tick

- In-process every 5 minutes, next to the campaign scheduler in `scheduler.ts`.
- External safety net: `GET /api/journeys/tick?key=<verify token>`, the same
  pattern as the campaigns tick.
- Single-flight: a second tick while one runs returns at once.
- `now` is a parameter of the engine, never read inside it.

### 6.3 Enrollment

- Activating a journey enrolls every member of its group.
- A member added to the group later is enrolled on the next tick. Steps already
  past are recorded `skipped` for them; they receive the steps still ahead.
- A member removed from the group becomes `removed` and receives nothing more.
- A member in two groups with two journeys receives both. Journeys are
  independent.
- An enrollment becomes `completed` when it has no unsent step left **and** 48
  hours have passed since its last send, so the stop check (§7.1) still covers
  the final message. A journey whose enrollments are all finished becomes
  `done`.

### 6.4 Late ticks

A step may be sent from its due time until 12 hours after it. If the service was
down for longer, the step is recorded `missed` for the members it did not reach
and is reported — never a surprise send in the middle of the night.

### 6.5 Meta's messaging limit

Before sending, the engine reads `getMessagingLimit()` and counts the distinct
members who received an outgoing message in the last 24 hours. Sends beyond the
remaining allowance are recorded `deferred` and retried on the next tick. A
deferred send still unsent when its 12-hour window closes becomes `missed`. The
count is deliberately conservative: it includes replies inside open windows.

## 7. Engine rules

Every tick, in this order.

### 7.1 Stop check — every active enrollment

Let `L` be the enrollment's latest journey send in state `sent` or `failed`.
A send has failed either when Meta rejects it at once (`journey_sends.state` is
`failed`) or when a `failed` status arrives later through the webhook (the
message's status is `failed`).

**Stop at once** when `L` failed and `classifyFailure(error)` returns
`undeliverable`. Reason `send_failed`. Any other failure kind leaves the member
in the path (the next step tries again) and raises an alert (§10.2), because it
points at our side — for example `params` means the template's variables are
wrong for everyone.

**Stop after silence** when `L` did not fail and all three hold:

1. `L.attempted_at` is at least 48 hours before `now`.
2. The member has no incoming message created after `L.attempted_at`.
3. `L`'s message status is not `read`.

The reason is `not_delivered` when that status is `accepted` or `sent`, and
`not_read` when it is `delivered`.

**On stop:**

- The enrollment becomes `stopped` with its reason and time.
- One `manual` follow-up opens (§9).
- One `sms` follow-up is queued (§8), only for an Israeli mobile number
  (`+9725` followed by 8 digits). Any other number gets no SMS item, and the
  manual task says so.

### 7.2 Sends — due steps

For each active enrollment and each step whose send window is open and which has
no `journey_sends` row yet:

1. **Claim.** Insert the `journey_sends` row in state `pending` first. The
   unique key on `(enrollment_id, step_id)` makes a second tick's insert fail,
   so the step is sent at most once even if the process dies mid-send.
2. **Channel.** Free text when the member's last incoming message is less than
   23 hours 50 minutes old (a 10-minute margin before Meta's 24-hour limit) and
   the step has free text. Otherwise the utility template.
3. **Send** through the existing `createMessage` → `sendWhatsAppText` /
   `sendWhatsAppTemplate` path. The member's name fills the template's name
   variable through the existing `fillNameToken`. The message row stores the
   free text, or the step's `template_preview`.
4. **Record** the channel, message id and final state on the claimed row.

A row still `pending` 10 minutes after `attempted_at` means the process died
between claim and record. It is never resent — Meta may already have the
message — and it is listed in the report for a person to check.

A step cannot be saved without a template, so there is always a channel that
works outside the window.

### 7.3 Prerequisite: delivery statuses only move forward

`updateMessageStatusByWhatsAppId` today writes whatever status arrives. Meta
delivers status updates out of order — on the Connec number we have measured
`delivered` arriving before `sent`. A late `delivered` arriving after `read`
turns a reader into a non-reader, and rule D5 would then stop someone who read
every message.

Fix, covered by a test: statuses rank `pending < accepted < sent < delivered <
read` and only move forward. `failed` replaces `pending`, `accepted` or `sent`,
and is ignored after `delivered` or `read`. This changes shared code, which is
why it lives on this branch with the rest.

## 8. SMS

`app/lib/sms.ts` exposes `sendSms(phone, body)`. The provider comes from
`SMS_PROVIDER`:

| Value | Behaviour |
|-------|-----------|
| `none` | Nothing is sent. Items stay `queued`, shown with the badge "بانتظار كريدز أفكار بـInforu". |
| `inforu` | Uses `INFORU_AUTH` — the complete `Basic …` header, the only form that authenticates; an HTTP 400 carries the real `StatusId` — and `SMS_SENDER`, lowercase English, 2–11 characters (for example `afkar`). |

- **Drain.** Each tick sends queued items, one attempt per item per tick, at
  most 3 attempts, then `failed` with the provider's error. Items are sent only
  between 09:00 and 20:00 Israel time.
- **Text.** One SMS text per template (`journey_templates.sms_text`), with the
  name token. The editor shows the character count and segment count: Arabic
  and Hebrew fit 70 characters in one message and 67 per part when split; Latin
  text fits 160 and 153.
- **No silent failure.** Every item is `queued`, `sent` or `failed` with a
  reason. None disappears.

## 9. Manual follow-up

Every stop opens one manual task: member, phone, journey, the step where they
stopped, and the reason in plain Arabic:

| Reason | Text |
|--------|------|
| `not_delivered` | الرسالة ما وصلت لجهازه خلال يومين |
| `not_read` | وصلت وما انقرأت خلال يومين |
| `send_failed` | الرقم ما بيستقبل واتساب — أو كود الدولة غلط (with the +972/+970 alternative from `alternateCountryCode`) |
| number not Israeli mobile | appended: رقم مش إسرائيلي — ما بيدخل طابور SMS |

Actions:

- **تم التواصل** + note — closes the task.
- **رجّعه للمسار** — the enrollment becomes `active` again and receives the next
  upcoming step. Missed steps are not resent.

A stopped member who replies is not resumed automatically; the report lists
them (§10.1) with the resume button.

## 10. Reporting

The journeys UI lives in its own components under `app/journeys/`, not inside
`app/page.tsx` (already 2,395 lines), opened from a new tab.

### 10.1 Journey page

**Cohort funnel**, with exact definitions so numbers can be reproduced:

| Row | Members with… |
|-----|----------------|
| Enrolled | an enrollment |
| Sent | at least one journey send in state `sent` |
| Reached | at least one journey message `delivered` or `read` |
| Read | at least one journey message `read` |
| Replied | an incoming message after their first journey send |
| Stopped | state `stopped`, split by reason |
| Replied after stop | stopped, with an incoming message after `stopped_at` |
| SMS | follow-ups by state: queued / sent / failed |
| Manual | follow-ups by state: open / done |

**Per step:** real due time, sent (free text vs template), failed, deferred,
missed, skipped, stuck `pending`, delivered, read, and replied within 48 hours
of that send.
This answers which message lost the cohort.

**Members:** filter by state and reason; each row opens the existing chat view.

**Follow-ups:** the SMS queue and the manual tasks, with their actions.

### 10.2 Telegram

- After each tick that sent anything: journey, step, sent (free text vs
  template), failed, deferred.
- Daily digest at 20:00 Israel time per active journey: replied today, stopped
  today by reason, SMS sent / queued / failed, manual tasks open and the age of
  the oldest.
- Immediate alert: a step failing for more than 20% of its sends, or any
  `missed` step.

### 10.3 Honesty on staging

When not live, every number on screen and every Telegram message carries
`🧪 محاكاة`, and simulated message ids start with `dryrun.`, so a simulated
funnel cannot be mistaken for a real one.

## 11. Testing

- **Runner:** `node:test`. TypeScript runs through `tsx` (new dev dependency),
  because the code imports through the `@/` path alias. Each test file points
  `APP_DATA_DIR` at its own temporary directory.
- **Shape:** the engine is split into `planTick(state, now)`, a pure function
  returning actions, and `applyActions`, which does the I/O. Rules are tested on
  `planTick` with fixtures:
  - channel at 23h49 vs 23h51 since the last incoming message
  - stop at 47h vs 49h of silence
  - read and silent → stays
  - `undeliverable` → stops at once; `params` → stays and alerts
  - late tick inside and after the 12-hour window
  - member added mid-journey → earlier steps `skipped`
  - two ticks at once → one send per `(enrollment, step)`
  - process dies between claim and record → not resent, reported
  - messaging limit reached → `deferred`, then `missed`
  - due time across a daylight-saving change
  - non-Israeli number → manual task, no SMS item
- **Guard test** (§4.2) and **status-order test** (§7.3).
- **On staging:** a journey on `internal testers` (4 members) first. Then a full
  run on the `كلين 232` group, stepping `?now=` through three weeks with
  simulated replies and statuses. The report must match a funnel worked out by
  hand before the run.

## 12. Files

**New**

- `app/lib/outbound-guard.ts`
- `app/lib/journeys/schema.ts` — migrations
- `app/lib/journeys/store.ts` — all journeys database access
- `app/lib/journeys/schedule.ts` — due-time arithmetic
- `app/lib/journeys/engine.ts` — `planTick` and `applyActions`
- `app/lib/journeys/report.ts` — funnel and per-step numbers
- `app/lib/sms.ts`
- `app/api/journeys/…` — templates, steps, journeys, follow-ups, tick
- `app/api/dev/simulate/route.ts`
- `app/journeys/*.tsx`
- `tests/*.test.ts`

**Changed**

- `app/lib/whatsapp.ts`, `app/lib/push.ts`, `app/lib/telegram.ts` — guard
- `app/lib/db.ts` — status ordering; runs the journeys migration
- `app/lib/scheduler.ts` — adds the journeys tick
- `app/api/webhook/whatsapp/route.ts` — body handling extracted into
  `handleWebhookPayload`, behaviour unchanged
- `app/page.tsx` — the new tab only

Journeys code reaches the database only through `app/lib/journeys/store.ts`, so
the engine can move to HeartBeat's PostgreSQL later without rewriting its rules.

## 13. Open decisions

1. **Production.** `OBT-Agency-Docs/PRODUCT-ARCHITECTURE.md` §6 says Afkar's
   production gets no code changes while HeartBeat is built. Shipping journeys
   to Afkar needs an explicit exception from Wisam. The alternative is that
   this becomes HeartBeat's first module.
2. **Template category.** Meta moves utility templates with promotional content
   into marketing. Step templates have to be service content — programme
   instructions and reminders. Offers belong in campaigns.
3. **SMS to +970 numbers.** Not verified with Inforu. Manual only until tested.
4. ~~**Telegram chat.**~~ Settled 2026-09-13: the chat is ours, not Afkar's, so
   staging copies both Telegram variables unchanged (§4.1).
