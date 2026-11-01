import { getDb } from "./db";

/**
 * تجاهل مهمة من شاشة «اليوم» — **لكل مستخدم على حدة**.
 *
 * 🔑 التجاهل **مش حذف**. المهمة بتضل بطابورها — التسجيل بيضل بانتظار
 * المراجعة، والتذكير بيضل مفتوح، والموقوفين بيضلّوا موقوفين. اللي بيصير
 * إنها بتنشال من شاشة اليوم وبس، لأنّ اليوم سؤاله «شو بدّه مني هلق»
 * وفي أشياء الجواب عليها «شفتها، مش هلق».
 *
 * وبتنحفظ مع لحظة التجاهل: أي حركة جديدة على المهمة بعدها بترجّعها
 * للشاشة لحالها. مهمة «3 تسجيلات» انتجاهلت وإجا رابع = شغل جديد، مش نفس
 * الشغل اللي انتجاهل.
 *
 * 🔑 **لكل واحد شاشته.** أول نسخة كانت بتخفي المهمة عن الكل — يعني
 * المدرّبة (ودورها موصوف «بلا تشغيل مسارات») بتقدر تشيل تسجيلاً من شاشة
 * أفكار وهي ما بتدري. و«شفتها، مش هلق» حكم شخصي أصلاً: اللي شافته أفكار
 * ما بيلزم يكون مساعدتها شافته.
 */
function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS dismissed_decisions (
      key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (key, user_id)
    );
  `);
}

const iso = (value: string) => (value.includes("T") ? value : `${value.replace(" ", "T")}Z`);

/** المفتاح ← لحظة تجاهله. */
export function listDismissed(userId: number) {
  ensureTable();
  const rows = getDb()
    .prepare("SELECT key, dismissed_at FROM dismissed_decisions WHERE user_id = ?")
    .all(userId) as Array<{ key: string; dismissed_at: string }>;
  return new Map(rows.map((row) => [row.key, iso(row.dismissed_at)]));
}

/** المفاتيح اللي بتعرفها الشاشة — أي إشي غيرها بينرفض. */
export function isKnownDecisionKey(key: string) {
  return /^(form|task|stopped)-\d+$/.test(key);
}

export function dismissDecision(key: string, userId: number) {
  ensureTable();
  getDb()
    .prepare(
      `INSERT INTO dismissed_decisions (key, user_id, dismissed_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key, user_id) DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP`
    )
    .run(key, userId);
}

/** للتراجع عن تجاهل — بترجّع المهمة لشاشة اليوم فوراً. */
export function restoreDecision(key: string, userId: number) {
  ensureTable();
  getDb().prepare("DELETE FROM dismissed_decisions WHERE key = ? AND user_id = ?").run(key, userId);
}
