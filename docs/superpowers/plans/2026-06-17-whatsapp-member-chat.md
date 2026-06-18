# WhatsApp Member Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Next.js MVP for member-based WhatsApp conversations.

**Architecture:** A single Next.js application serves both the UI and API routes. Server routes use Node's built-in SQLite module to persist members and messages, and call the WhatsApp Business Cloud API for outbound messages.

**Tech Stack:** Next.js, React, TypeScript, Node `node:sqlite`, SQLite, WhatsApp Business Cloud API.

## Global Constraints

- Keep the MVP small and runnable from one project directory.
- Store local data in `data/app.sqlite`.
- Configure WhatsApp through environment variables only.
- Do not hard-code access tokens or phone number IDs.
- Use `/api/webhook/whatsapp` for Meta webhook verification and inbound messages.

---

### Task 1: Scaffold App

**Files:**
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Produces: Next.js scripts `dev`, `build`, `start`, `lint`.

- [x] Create a minimal Next.js application configuration.
- [x] Document required WhatsApp environment variables.

### Task 2: Data Layer

**Files:**
- Create: `app/lib/db.ts`
- Create: `app/lib/whatsapp.ts`
- Create: `app/types/node-sqlite.d.ts`

**Interfaces:**
- Produces: `listMembers`, `createMember`, `getMember`, `listMessages`, `createMessage`, `updateMessageStatus`, `findOrCreateMemberByPhone`, and `sendWhatsAppText`.

- [x] Initialize SQLite schema on first use.
- [x] Expose typed helpers for members and messages.
- [x] Add a WhatsApp send helper that returns the Graph API message id.

### Task 3: API Routes

**Files:**
- Create: `app/api/members/route.ts`
- Create: `app/api/members/[id]/messages/route.ts`
- Create: `app/api/messages/send/route.ts`
- Create: `app/api/webhook/whatsapp/route.ts`

**Interfaces:**
- Produces: REST endpoints consumed by the UI and Meta webhook.

- [x] Add member CRUD-lite routes.
- [x] Add message listing and sending routes.
- [x] Add WhatsApp webhook verification and inbound message ingestion.

### Task 4: UI

**Files:**
- Create: `app/page.tsx`
- Create: `app/layout.tsx`
- Create: `app/globals.css`

**Interfaces:**
- Consumes: API routes from Task 3.

- [x] Build member creation form.
- [x] Build member list.
- [x] Build conversation thread and message composer.
- [x] Poll selected conversation for new inbound messages.

### Task 5: Verification

**Files:**
- Modify: generated project files only if build errors expose issues.

**Interfaces:**
- Consumes: `npm install`, `npm run build`, `npm run dev`.

- [ ] Install dependencies.
- [ ] Run production build.
- [ ] Start local dev server and share the URL.

