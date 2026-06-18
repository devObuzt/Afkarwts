# WhatsApp Member Chat Design

## Goal

Build a small internal web app where an operator can add a member phone number, send that member a WhatsApp Business Cloud API message, receive replies through a webhook, and continue the conversation from one screen.

## Approach

Use a single Next.js app with API routes and SQLite storage. The first version should be easy to run locally and easy to deploy behind a public URL for the WhatsApp webhook.

## Core Features

- Add a member with name, WhatsApp phone number, and optional notes.
- Show all members in a left-side list.
- Show the selected member's message thread.
- Send a plain text WhatsApp message from the conversation view.
- Receive inbound WhatsApp webhook messages and store them in the same thread.
- Store all data in a local SQLite database at `data/app.sqlite`.

## WhatsApp Configuration

The app reads WhatsApp credentials from environment variables:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`, defaulting to `v23.0`

The webhook URL is `/api/webhook/whatsapp`. The GET route verifies Meta's webhook challenge. The POST route ingests inbound messages.

## Known MVP Limit

WhatsApp may require an approved template message when starting a conversation outside the customer service window. This MVP implements text sending first. Template sending can be added as a separate route once the template name and language are known.

