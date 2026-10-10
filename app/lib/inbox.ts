import { getDb } from "./db";

/**
 * The conversation rail.
 *
 * The old inbox loads every member — 3,952 of them — because it was the
 * whole screen and could afford to. Beside a CRM it cannot: this returns
 * the threads that have actually been spoken in, newest first, with the one
 * line of preview the rail shows and nothing else.
 */

export type Thread = {
  memberId: number;
  name: string;
  phone: string;
  unread: number;
  lastAt: string;
  lastBody: string;
  lastDirection: "incoming" | "outgoing";
  /** True while a free-text reply is still allowed. */
  windowOpen: boolean;
};

function toIso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

export function listThreads(filter: { query?: string; limit?: number } = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(filter.limit ?? 40, 1), 200);

  const where: string[] = ["last.id IS NOT NULL"];
  const args: Array<string | number> = [];

  const query = (filter.query ?? "").trim();
  if (query) {
    const digits = query.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length >= 4) {
      where.push("(m.name LIKE ? OR REPLACE(m.phone, '+', '') LIKE ?)");
      args.push(`%${query}%`, `%${digits}%`);
    } else {
      where.push("m.name LIKE ?");
      args.push(`%${query}%`);
    }
  }

  const rows = db
    .prepare(
      `SELECT m.id, m.name, m.phone, last.body, last.direction, last.created_at,
              (SELECT COUNT(*) FROM messages msg
                WHERE msg.member_id = m.id AND msg.direction = 'incoming'
                  AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)) AS unread,
              (SELECT MAX(created_at) FROM messages msg
                WHERE msg.member_id = m.id AND msg.direction = 'incoming') AS last_in
         FROM members m
         LEFT JOIN messages last
           ON last.id = (SELECT id FROM messages WHERE member_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1)
        WHERE ${where.join(" AND ")}
        ORDER BY (unread > 0) DESC, last.created_at DESC
        LIMIT ?`
    )
    .all(...args, limit) as Array<Record<string, string | number | null>>;

  const threads: Thread[] = rows.map((row) => {
    const lastIn = row.last_in ? new Date(toIso(String(row.last_in))).getTime() : 0;
    return {
      memberId: Number(row.id),
      name: String(row.name),
      phone: String(row.phone),
      unread: Number(row.unread ?? 0),
      lastAt: toIso(String(row.created_at)),
      lastBody: String(row.body ?? ""),
      lastDirection: (row.direction as "incoming" | "outgoing") ?? "outgoing",
      windowOpen: lastIn > 0 && Date.now() - lastIn < 24 * 60 * 60 * 1000
    };
  });

  const unreadTotal = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages msg
             JOIN members m ON m.id = msg.member_id
            WHERE msg.direction = 'incoming'
              AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)`
        )
        .get() as { n: number }
    ).n
  );

  return { threads, unreadTotal };
}
