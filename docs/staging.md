# Staging

A parallel copy of the Afkar HeartBeat platform, used to build message
journeys. The live platform at `www.afkarheartbeat.com` is untouched: it
deploys from `main`, staging deploys from `journeys`.

| | |
|---|---|
| URL | https://web-production-1ae1f3.up.railway.app |
| Railway project | `afkar-heartbeat-staging` (`e0ecb21e-3bb5-4a0d-8020-21587367310d`) |
| Service | `web` (`22045879-fa44-4469-bb3a-e22c6b6b53b8`), branch `journeys` |
| Volume | `afkar-staging-data` at `/app/data` |
| Database | copy of `app_2026-09-09_1629.sqlite`, MD5 `bbe053dd476d2e5bd7e18f9e6f6e5593` |

## How it differs from production

Every variable was copied from the production service through the Railway CLI,
straight into staging, without being written to disk. Four were overridden and
three were deliberately left out.

| Variable | Staging | Why |
|----------|---------|-----|
| `DRY_RUN` | `1` | Belt to the braces of the project-name check in `outbound-guard.ts`. |
| `WHATSAPP_VERIFY_TOKEN` | fresh random value | A staging key cannot trigger production's tick, or the reverse. |
| `SMS_PROVIDER` | `none` | Nothing is sent even once Afkar's Inforu credentials arrive. |
| `Admin_User`, `Admin_Pass` | staging's own | Changed 2026-09-14. Staging no longer shares production's admin password: a copy of it on a second host is a risk with no upside, and it let the screens be checked in a browser without anyone typing production's password into a form. |
| `APP_DATA_DIR` | `/app/data` | The mounted volume. |
| `FIREBASE_PROJECT_ID` | **not set** | The copied database holds four live device tokens belonging to Afkar staff. Without these, `sendPushToDevices` returns `skipped` before it can reach Google. |
| `FIREBASE_CLIENT_EMAIL` | **not set** | as above |
| `FIREBASE_PRIVATE_KEY` | **not set** | as above |

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are copied unchanged: the chat is
ours, not Afkar's, and every message the guard sends from here is prefixed as a
simulation.

No Meta webhook points here. Replies and delivery statuses are injected through
`POST /api/dev/simulate`, which hands them to the same handler the real webhook
uses.

## Safety checks, 2026-09-13

All six passed. The script lives at `scratchpad/gate-checks.sh` in the session
that ran them; the assertions are repeated here.

| Check | Result |
|-------|--------|
| Boot log says `Outbound disabled - no WhatsApp, SMS or push will leave this process.` | pass, deployment `20749f34` at 15:07:58Z |
| Admin login works against the restored database | pass |
| Sending to a real member returns a `dryrun.` id and makes no call to Meta | pass — member 3948, id `dryrun.694ad474-f3b3-4b92-a304-a0d8b90a48d8` |
| `POST /api/dev/simulate` adds exactly one incoming message | pass |
| Production refuses the simulator path | pass — 401 from its auth middleware |
| The simulator does not exist on `main` | pass — no such file in `origin/main` |

The production check is 401 rather than 404 because production's middleware
auth-walls every unknown `/api/*` path before Next can answer 404. The route
itself exists only on `journeys`, and returns 404 wherever `isLive()` is true.

## Database restore

```bash
base64 -i app_2026-09-09_1629.sqlite | railway ssh "base64 -d > /app/data/app.sqlite"
```

Verified on the container afterwards: MD5 identical to the source,
`integrity_check` ok, 3,950 members, 4,816 messages, 11 campaigns, 4 devices,
and the three groups including `كلين 232 - 30.08`.

The file never passed through a bucket or any third-party service.
