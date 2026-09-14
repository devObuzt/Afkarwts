# Simulated cohort run, 2026-09-14

Three weeks of a cohort driven through staging in a few minutes, against a
funnel written down before anything ran. **Every prediction matched on the
first run.**

## What was run

A ten-member test cohort rather than ten members copied from
`كلين 232 - 30.08`, deliberately: real members carry real message history, so
their "last incoming" timestamps are not knowable in advance and no exact
prediction could be made. Test members also pin the `+970` case. The real
cohort group was left alone and verified untouched afterwards.

| Role | Members | Behaviour driven through the simulator |
|------|---------|----------------------------------------|
| replier | R1, R2 | read, and replied after each send |
| reader | K1, K2, K3 | read every message, never replied |
| delivered-unread | D1, D2 | delivered, never read |
| never-delivered | N1, N2 | no status ever arrived |
| never-delivered, `+970` | P1 | no status, and not reachable by SMS |

Three steps, each Sunday at 07:00 Israel time, anchored 2026-08-30: `welcome`
(template only), `midweek` (template only), `closing` (free text + template).
R1 and R2 were given a reply eight hours before the third step, to open the
24-hour window for it.

## Predicted against actual

| Funnel | Predicted | Actual |
|--------|-----------|--------|
| enrolled | 10 | 10 |
| sent | 10 | 10 |
| reached | 7 | 7 |
| read | 5 | 5 |
| replied | 2 | 2 |
| stopped | not_read 2 · not_delivered 3 | not_read 2 · not_delivered 3 |
| replied after stopping | 0 | 0 |

| Step | Predicted | Actual |
|------|-----------|--------|
| welcome | 10 template · 7 delivered · 5 read · 2 replied | identical |
| midweek | 5 template · 5 delivered · 5 read · 2 replied | identical |
| closing | **2 free text** · 3 template · 5 read · 2 replied | identical |

No step recorded a single failure, deferral, miss, skip or stuck row.

The three rules worth naming, each confirmed by the run:

- **The channel followed the window.** The same members got templates in weeks
  1 and 2, and free text in week 3 — because a reply landed inside the window
  only before the third step.
- **Only the unreached left.** D1 and D2, delivered but unread, stopped at
  `not_read`; K1-K3, who read and never replied, stayed to the end and
  completed. That is the distinction the whole design turns on.
- **P1 got a manual task and no SMS.** Four SMS items were queued and sent
  (simulated), one for each stopped Israeli mobile; the Palestinian number was
  told so in its task instead of failing later.

Final states: **5 completed, 5 stopped**, with 5 manual tasks open.

## Nothing was sent

- Every one of the 20 outgoing messages carried a `dryrun.` id. Twenty of
  twenty.
- The real `كلين 232 - 30.08` group has no enrollments and received no outgoing
  message during the run.
- Production still deploys from `main`, last deployed 2026-08-27 — before this
  work began.

## Caveat

Statuses and replies were injected through `/api/dev/simulate`, which feeds the
same handler as the real webhook. What this run does **not** prove is Meta's
own behaviour: that a template is accepted, that a delivery receipt arrives
when expected, or that the number's messaging limit behaves as read. Those are
only testable against a live number, and are the first thing to watch when this
ever goes live.
