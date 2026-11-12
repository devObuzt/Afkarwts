import { getDb } from "../db";
import { normalizeTown } from "./regions";

/**
 * مسار التوصيل بيتعلّم من ترتيب الإيد.
 *
 * الترتيب الرسمي بالملف تخمين مبني على الجغرافيا. اللي بيعرف المسار
 * فعلاً هو اللي بيسوق فيه — فلما يسحب السطور ويرتّبهن، هاد تصحيح
 * للمسار، ومنيح إنه ينتعلّم بدل ما ينعاد كل دفعة.
 *
 * 🔴 **بس مش كل سحبة تصحيح مسار.** لما تنسحب وحدة لفوق القائمة لأنها
 * بتيجي تاخد طلبها بالإيد، هاي استثناء لشخص — ولو تعلّمنا منها بنكون
 * نقلنا **بلدها كلها** لأول المسار، وبينعاد الغلط كل دفعة جاية بلا
 * ما يلاحظ حدا.
 *
 * فالتعلّم بيصير **بس لما البلاد تضل متلمّة**: كل بلد سطورها ورا بعض
 * وبس ترتيب البلاد اللي تغيّر. هاد توقيع «عدّلت المسار». أما لما تنشق
 * بلد — سطر منها طلع برّا كتلتها — فهاد توقيع «استثناء لشخص»، وما
 * منتعلّم منه ولا منزعج حدا بسؤال.
 */

export type Placed = { city: string; hebrewCity?: string };

/** مفتاح البلد اللي منخزّن فيه — نفس تسوية `regions`. */
export function townKey(row: Placed) {
  return normalizeTown(row.city || row.hebrewCity || "");
}

/**
 * تسلسل البلاد من ترتيب جاهز، أو `null` لما يكون في بلد مشقوقة.
 *
 * بترجع `null` كمان لما يكون في أقل من بلدين: ما في مسار ينتعلّم.
 */
export function townSequence(rows: Placed[]) {
  const seen: string[] = [];
  const closed = new Set<string>();
  let last = "";

  for (const row of rows) {
    const key = townKey(row);
    if (!key) {
      continue;
    }
    if (key === last) {
      continue;
    }
    if (closed.has(key)) {
      // رجعت بلد بعد ما خلصت كتلتها: السطور مش متلمّة.
      return null;
    }
    if (last) {
      closed.add(last);
    }
    seen.push(key);
    last = key;
  }

  return seen.length >= 2 ? seen : null;
}

export function migrateTownOrder() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS town_order (
      town TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/** ترتيب البلاد المتعلَّم: مفتاح البلد ← موقعه. فاضي = ما تعلّمنا إشي بعد. */
export function loadTownOrder() {
  migrateTownOrder();
  const rows = getDb().prepare("SELECT town, position FROM town_order").all() as Array<{
    town: string;
    position: number;
  }>;
  return new Map(rows.map((row) => [row.town, row.position]));
}

/**
 * بتكتب التسلسل المتعلَّم. بترجع عدد البلاد اللي تغيّر محلها — صفر
 * معناها الترتيب اليدوي طابق المتعلَّم، فما في جديد ينتوثّق.
 */
export function saveTownOrder(sequence: string[]) {
  migrateTownOrder();
  const before = loadTownOrder();
  const db = getDb();

  let changed = 0;
  db.exec("BEGIN");
  try {
    const write = db.prepare(
      `INSERT INTO town_order (town, position, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (town) DO UPDATE SET position = excluded.position, updated_at = CURRENT_TIMESTAMP`
    );
    sequence.forEach((town, index) => {
      if (before.get(town) !== index) {
        changed += 1;
      }
      write.run(town, index);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return changed;
}

/** بتشيل كل اللي انتعلّم، فيرجع الترتيب الرسمي لملف `regions` لحاله. */
export function forgetTownOrder() {
  migrateTownOrder();
  getDb().prepare("DELETE FROM town_order").run();
}
