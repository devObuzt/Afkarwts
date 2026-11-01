import { getDb } from "./db";

/**
 * تجاهل مهمة من شاشة «اليوم».
 *
 * 🔑 التجاهل **مش حذف**. المهمة بتضل بطابورها — التسجيل بيضل بانتظار
 * المراجعة، والتذكير بيضل مفتوح، والموقوفين بيضلّوا موقوفين. اللي بيصير
 * إنها بتنشال من شاشة اليوم وبس، لأنّ اليوم سؤاله «شو بدّه مني هلق»
 * وفي أشياء الجواب عليها «شفتها، مش هلق».
 *
 * وبتنحفظ مع لحظة التجاهل: أي حركة جديدة على المهمة بعدها بترجّعها
 * للشاشة لحالها. مهمة «3 تسجيلات» انتجاهلت وإجا رابع = شغل جديد، مش نفس
 * الشغل اللي انتجاهل.
 */
function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS dismissed_decisions (
      key TEXT PRIMARY KEY,
      dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      dismissed_by INTEGER
    );
  `);
}

const iso = (value: string) => (value.includes("T") ? value : `${value.replace(" ", "T")}Z`);

/** المفتاح ← لحظة تجاهله. */
export function listDismissed() {
  ensureTable();
  const rows = getDb().prepare("SELECT key, dismissed_at FROM dismissed_decisions").all() as Array<{
    key: string;
    dismissed_at: string;
  }>;
  return new Map(rows.map((row) => [row.key, iso(row.dismissed_at)]));
}

export function dismissDecision(key: string, userId?: number) {
  ensureTable();
  getDb()
    .prepare(
      `INSERT INTO dismissed_decisions (key, dismissed_at, dismissed_by)
       VALUES (?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(key) DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP, dismissed_by = excluded.dismissed_by`
    )
    .run(key, userId ?? null);
}

/** للتراجع عن تجاهل — بترجّع المهمة لشاشة اليوم فوراً. */
export function restoreDecision(key: string) {
  ensureTable();
  getDb().prepare("DELETE FROM dismissed_decisions WHERE key = ?").run(key);
}
