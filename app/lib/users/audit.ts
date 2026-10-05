import { getDb } from "../db";

/**
 * Who did what. With one shared login this had no meaning; with several
 * people it is what settles «مين بعت هاي الرسالة» — and the only way a
 * permission change leaves a trace.
 *
 * Writing it never fails the action it describes: a lost log line is worse
 * than nothing, a failed send because of a lost log line is worse still.
 */
export type AuditEntry = {
  id: number;
  userId: number | null;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  detail: string;
  createdAt: string;
};

export const ACTION_LABEL: Record<string, string> = {
  "session.login": "تسجيل دخول",
  "session.logout": "تسجيل خروج",
  "session.failed": "محاولة دخول فاشلة",
  "message.send": "إرسال رسالة",
  "member.update": "تعديل بيانات منتسب",
  "member.delete": "حذف منتسب",
  "file.upload": "رفع ملف",
  "file.delete": "حذف ملف",
  "file.rename": "تغيير اسم ملف",
  "lead.approve": "الموافقة على تسجيل",
  "lead.reject": "رفض تسجيل",
  "journey.status": "تغيير حالة مسار",
  "user.create": "إنشاء مستخدم",
  "user.update": "تعديل صلاحيات مستخدم",
  "user.password": "تغيير كلمة المرور"
};

export function recordAction(input: {
  userId: number | null;
  actor: string;
  action: string;
  subjectType?: string;
  subjectId?: string | number;
  subjectLabel?: string;
  detail?: string;
}) {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (user_id, actor, action, subject_type, subject_id, subject_label, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.userId,
        input.actor,
        input.action,
        input.subjectType ?? "",
        input.subjectId === undefined ? "" : String(input.subjectId),
        input.subjectLabel ?? "",
        input.detail ?? ""
      );
  } catch {
    // Logging is a witness, not a gate.
  }
}

export function listAudit(filter: { userId?: number; action?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (filter.userId) {
    where.push("user_id = ?");
    args.push(filter.userId);
  }
  if (filter.action) {
    where.push("action = ?");
    args.push(filter.action);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);

  const rows = getDb()
    .prepare(
      `SELECT id, user_id, actor, action, subject_type, subject_id, subject_label, detail, created_at
         FROM audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, limit, Math.max(filter.offset ?? 0, 0)) as Array<Record<string, string | number | null>>;

  return rows.map((row) => ({
    id: Number(row.id),
    userId: row.user_id === null ? null : Number(row.user_id),
    actor: String(row.actor),
    action: String(row.action),
    subjectType: String(row.subject_type),
    subjectId: String(row.subject_id),
    subjectLabel: String(row.subject_label),
    detail: String(row.detail),
    createdAt: String(row.created_at)
  })) as AuditEntry[];
}
