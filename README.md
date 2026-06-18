# Afkar WhatsApp Member Chat

A small Next.js MVP for adding members, sending WhatsApp Business Cloud API messages, sending files, images, and videos, and receiving replies through a webhook.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Fill in:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- `APP_DATA_DIR`

4. Run the app:

```bash
npm run dev
```

5. Configure Meta's webhook callback URL to:

```text
https://your-public-domain.com/api/webhook/whatsapp
```

Use the same value from `WHATSAPP_VERIFY_TOKEN` as the webhook verify token.

## Notes

WhatsApp may require approved template messages to start conversations outside the allowed customer service window. Set `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`, then use the "Send template" button to start the conversation. After the member replies, use normal text messages.

Media files are capped at 64 MB and stored under `APP_DATA_DIR/media`. On Railway, attach a volume or use object storage before relying on media persistence across restarts or redeploys.
