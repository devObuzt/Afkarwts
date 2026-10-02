# Registration forms and leads — design

**Date:** 2026-10-02
**Status:** approved in chat, ready for an implementation plan

## The problem

Afkar opens a Clean cohort roughly every few weeks. Today the intake runs on a
Google Form: the link is sent out, people fill it in, and the answers sit in a
spreadsheet that nobody connects to HeartBeat. Someone then types the names and
phone numbers into HeartBeat by hand, puts them in a group, and starts the
journey. The medical answers — conditions, medication, pregnancy, allergies —
stay in the spreadsheet, away from the person's thread.

This builds the intake into HeartBeat: a form per cohort, its own link, and
every registration landing beside the contact it belongs to.

## What we are building

1. A **form** per cohort, generated from an editable Clean template, with its
   own public link and one group attached.
2. A **public page** at that link, open without a login.
3. A **lead** per submission — reviewed, then turned into a member of the
   cohort's group with one click.
4. A **leads page** showing every submission and all of its answers.
5. A **shared menu** across the admin pages.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Form builder scope | A Clean template whose questions can be edited — not a general builder | Afkar needs the Clean form working now, and will tweak a question per cohort. A general builder delays that by weeks for flexibility she may never use. |
| On submission | Lands as a **lead**; becomes a member only on approval | The link is public, and `members.phone` is UNIQUE — an automatic path either fails or silently overwrites a returning participant. And an active journey would start messaging whoever filled the form, with no undo. |
| Link scope | One link per cohort, tied to one group | Matches how Afkar works: a cohort is a group with a start date. |
| Payment | Out of scope | Handled outside the form today. |
| Editing questions | Affects the form going forward; past submissions keep the question text they were answered against | A submission has to stay readable years later. |
| Health answers | Stored as given, kept, visible to anyone signed in | Raised as a risk (medical data + one shared login) and decided by Wisam: HeartBeat is Afkar's own system and this is not the moment to add an access-control layer. Recorded here so the choice is deliberate, not an oversight. |

## Data model

Four tables, additive — nothing existing is altered, so the migration is safe
against the production database. They follow the journeys tables' conventions.

```
forms
  id, name, token (UNIQUE, the public link), group_id,
  status TEXT CHECK (status IN ('open','closed')),
  intro TEXT,                     -- shown above the questions
  created_at, closed_at

form_fields
  id, form_id, position,
  label TEXT, help TEXT,
  kind TEXT CHECK (kind IN ('text','textarea','phone','date','choice','multi','consent')),
  required INTEGER,
  options TEXT,                   -- JSON array, for choice/multi
  maps_to TEXT,                   -- '', 'name', 'phone', 'city' — fills the member record
  archived_at TEXT

form_submissions
  id, form_id, state TEXT CHECK (state IN ('new','added','rejected')),
  member_id INTEGER,              -- set when approved
  submitted_at, handled_at

form_answers
  id, submission_id, field_id,
  label TEXT,                     -- the question as it read when answered
  value TEXT
```

`form_answers.label` is the reason a past submission stays readable after the
question is edited or removed: the answer carries its own question.

## The public page

`/f/<token>` — server-rendered, no login. Added to the middleware's public
prefixes alongside the webhook and tick endpoints.

- Renders the form's fields in order, RTL, on the same visual language as the
  rest of the app.
- A closed form renders "انتهى التسجيل" and accepts nothing.
- An unknown token renders a plain not-found, with no hint about which tokens
  exist.
- Submitting posts to `/api/f/<token>`.

**Validation lives on the server.** Required fields, phone shape, and the
field list all come from the database at submit time — the browser's copy is a
convenience, not the authority. A field the form does not have is ignored
rather than stored.

**Phone normalisation** reuses what the app already does for Israeli numbers,
so `054-522-7674`, `0545227674` and `+972545227674` land as one value.

## From lead to member

The leads page lists submissions newest first, filtered by form and state, each
showing name, phone, when, and a badge if the phone already belongs to a
member. Opening one shows every answer.

Approving a lead, one or many at once:

- **Phone not known** → create the member (name, phone, city from the mapped
  fields) and add them to the form's group.
- **Phone known** → the row is marked `موجود مسبقاً` and approval asks which:
  update the existing member's details and add them to the group, or add them
  to the group leaving their details alone. Never a silent overwrite.
- Either way the submission moves to `added` and keeps a link to the member, so
  the thread and the registration are reachable from each other.

Rejecting marks the submission `rejected`; nothing is deleted.

An approved member enters the cohort group — and if that group's journey is
already running, the journey's own enrolment rules take over from there. This
feature does not reach into the journey engine.

## Forms management

Creating a form asks for a name, a group, and starts from the Clean template.
The editor lists the fields with add / edit / remove / reorder, and each field
has its label, help text, kind, required flag, options, and mapping. The page
shows the public link with a copy button, the submission count, and a toggle
between open and closed.

The Clean template is seeded in code — the nineteen questions from the Google
form, with the name, phone and address questions pre-mapped to the member
fields.

## Navigation

A single header component used by the admin pages: Inbox · Journeys ·
Templates · Leads, with the current page marked. The public form page does not
carry it.

## Testing

Covered by `node:test` the way the journeys work is, each file in its own temp
data dir:

- A submission stores an answer per field, with the question text alongside.
- A required field left empty is refused by the API, not only by the browser.
- A closed form refuses a submission.
- An unknown token refuses a submission.
- A field that is not on the form is ignored rather than stored.
- Approving an unknown phone creates the member and puts them in the group.
- Approving a known phone does not overwrite the member unless asked, and still
  adds them to the group.
- Approving twice does not add the member twice.
- Editing a question leaves old answers reading against the old wording.
- A closed form still shows its submissions.

## Out of scope

- A general-purpose form builder.
- Payment or invoicing.
- Per-user logins and permissions.
- File uploads in a form.
- Editing a submitted answer.
