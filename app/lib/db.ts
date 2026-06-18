import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDataDir } from "./media-store";

export type Member = {
  id: number;
  name: string;
  phone: string;
  notes: string;
  createdAt: string;
};

export type Message = {
  id: number;
  memberId: number;
  direction: "incoming" | "outgoing";
  messageType: "text" | "image" | "video" | "document";
  body: string;
  whatsappMessageId: string | null;
  status: "received" | "pending" | "accepted" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  createdAt: string;
};

type DbMember = {
  id: number;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
};

type DbMessage = {
  id: number;
  member_id: number;
  direction: "incoming" | "outgoing";
  message_type: Message["messageType"];
  body: string;
  whatsapp_message_id: string | null;
  status: Message["status"];
  error: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  created_at: string;
};

const globalForDb = globalThis as typeof globalThis & {
  __afkarDb?: DatabaseSync;
};

function getDb() {
  if (!globalForDb.__afkarDb) {
    const dataDir = getDataDir();
    const db = new DatabaseSync(path.join(dataDir, "app.sqlite"));
    db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'document')),
        body TEXT NOT NULL,
        whatsapp_message_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'accepted', 'sent', 'delivered', 'read', 'failed')),
        error TEXT,
        media_url TEXT,
        media_mime_type TEXT,
        media_filename TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_member_created
      ON messages(member_id, created_at);
    `);
    migrateMessageStatuses(db);
    migrateMediaColumns(db);
    globalForDb.__afkarDb = db;
  }

  return globalForDb.__afkarDb;
}

function migrateMessageStatuses(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get() as
    | { sql: string }
    | undefined;

  if (!row?.sql || row.sql.includes("'accepted'")) {
    return;
  }

  db.exec(`
    ALTER TABLE messages RENAME TO messages_old;

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
      body TEXT NOT NULL,
      whatsapp_message_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'accepted', 'sent', 'delivered', 'read', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    INSERT INTO messages (id, member_id, direction, body, whatsapp_message_id, status, error, created_at)
    SELECT id, member_id, direction, body, whatsapp_message_id, status, error, created_at
    FROM messages_old;

    DROP TABLE messages_old;

    CREATE INDEX IF NOT EXISTS idx_messages_member_created
    ON messages(member_id, created_at);
  `);
}

function mapMember(row: DbMember): Member {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function mapMessage(row: DbMessage): Message {
  return {
    id: row.id,
    memberId: row.member_id,
    direction: row.direction,
    messageType: row.message_type ?? "text",
    body: row.body,
    whatsappMessageId: row.whatsapp_message_id,
    status: row.status,
    error: row.error,
    mediaUrl: row.media_url,
    mediaMimeType: row.media_mime_type,
    mediaFilename: row.media_filename,
    createdAt: row.created_at
  };
}

function hasColumn(db: DatabaseSync, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function migrateMediaColumns(db: DatabaseSync) {
  const additions = [
    ["message_type", "TEXT NOT NULL DEFAULT 'text'"],
    ["media_url", "TEXT"],
    ["media_mime_type", "TEXT"],
    ["media_filename", "TEXT"]
  ] as const;

  for (const [column, definition] of additions) {
    if (!hasColumn(db, "messages", column)) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
    }
  }
}

export function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  if (trimmed.startsWith("00")) {
    const internationalDigits = digits.replace(/^00/, "");
    if (!internationalDigits || internationalDigits.startsWith("0")) {
      throw new Error("Use a full international WhatsApp number with country code, for example +972501234567.");
    }

    return `+${internationalDigits}`;
  }

  if (trimmed.startsWith("+")) {
    if (digits.startsWith("0")) {
      throw new Error("Do not include a local leading 0 after '+'. Use country code, for example +972501234567.");
    }

    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    throw new Error("Use a full international WhatsApp number with country code, for example +972501234567.");
  }

  return `+${digits}`;
}

export function phoneForWhatsApp(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export function listMembers() {
  const rows = getDb()
    .prepare("SELECT * FROM members ORDER BY created_at DESC")
    .all() as DbMember[];
  return rows.map(mapMember);
}

export function createMember(input: { name: string; phone: string; notes?: string }) {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  const notes = input.notes?.trim() ?? "";

  if (!name) {
    throw new Error("Member name is required.");
  }

  if (!phone || phone.length < 8) {
    throw new Error("A valid WhatsApp phone number is required.");
  }

  const result = getDb()
    .prepare("INSERT INTO members (name, phone, notes) VALUES (?, ?, ?)")
    .run(name, phone, notes);

  return getMember(Number(result.lastInsertRowid));
}

export function getMember(id: number) {
  const row = getDb().prepare("SELECT * FROM members WHERE id = ?").get(id) as DbMember | undefined;
  return row ? mapMember(row) : null;
}

export function findOrCreateMemberByPhone(input: { phone: string; profileName?: string }) {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new Error("A valid WhatsApp phone number is required.");
  }

  const existing = getDb().prepare("SELECT * FROM members WHERE phone = ?").get(phone) as DbMember | undefined;

  if (existing) {
    return mapMember(existing);
  }

  const result = getDb()
    .prepare("INSERT INTO members (name, phone, notes) VALUES (?, ?, ?)")
    .run(input.profileName?.trim() || phone, phone, "Created from WhatsApp webhook");

  const member = getMember(Number(result.lastInsertRowid));
  if (!member) {
    throw new Error("Could not create webhook member.");
  }

  return member;
}

export function listMessages(memberId: number) {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE member_id = ? ORDER BY created_at ASC, id ASC")
    .all(memberId) as DbMessage[];
  return rows.map(mapMessage);
}

export function createMessage(input: {
  memberId: number;
  direction: Message["direction"];
  messageType?: Message["messageType"];
  body: string;
  whatsappMessageId?: string | null;
  status: Message["status"];
  error?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
}) {
  const result = getDb()
    .prepare(
      "INSERT INTO messages (member_id, direction, message_type, body, whatsapp_message_id, status, error, media_url, media_mime_type, media_filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      input.memberId,
      input.direction,
      input.messageType ?? "text",
      input.body,
      input.whatsappMessageId ?? null,
      input.status,
      input.error ?? null,
      input.mediaUrl ?? null,
      input.mediaMimeType ?? null,
      input.mediaFilename ?? null
    );

  const row = getDb().prepare("SELECT * FROM messages WHERE id = ?").get(Number(result.lastInsertRowid)) as DbMessage;
  return mapMessage(row);
}

export function updateMessageStatus(
  id: number,
  input: { status: Message["status"]; whatsappMessageId?: string | null; error?: string | null }
) {
  getDb()
    .prepare("UPDATE messages SET status = ?, whatsapp_message_id = ?, error = ? WHERE id = ?")
    .run(input.status, input.whatsappMessageId ?? null, input.error ?? null, id);

  const row = getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as DbMessage;
  return mapMessage(row);
}

export function updateMessageStatusByWhatsAppId(
  whatsappMessageId: string,
  input: { status: Message["status"]; error?: string | null }
) {
  const existing = getDb()
    .prepare("SELECT * FROM messages WHERE whatsapp_message_id = ?")
    .get(whatsappMessageId) as DbMessage | undefined;

  if (!existing) {
    return null;
  }

  getDb()
    .prepare("UPDATE messages SET status = ?, error = ? WHERE whatsapp_message_id = ?")
    .run(input.status, input.error ?? null, whatsappMessageId);

  const row = getDb()
    .prepare("SELECT * FROM messages WHERE whatsapp_message_id = ?")
    .get(whatsappMessageId) as DbMessage;
  return mapMessage(row);
}
