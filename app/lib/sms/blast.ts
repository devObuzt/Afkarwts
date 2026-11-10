import { getDb, type Member } from "../db";
import { isOptedOut } from "../members/opt-out";
import { shortOptOutLink } from "../members/opt-out-token";

/**
 * إرسال SMS لملصقات مختارة، من جوّا المنظومة.
 *
 * 🔑 **ليش جوّا المنظومة مش أداة طرفية:** الأداة بدها قاعدة الإنتاج،
 * والقاعدة على فوليوم ريلواي — يعني كل إرسالة بتعتمد على `railway ssh`،
 * وهاد انكسر بتغيّر مفتاح المضيف. والأهم إنّ الإرسال الجماعي ميزة
 * للطاقم أصلاً، مش شغلة لمرّة.
 *
 * كل مستلمة بتاخد **رابط هسرة خاص فيها**: اسم المرسل أبجدي وما بينرد
 * عليه، فبلا الرابط سطر «وقف» كلام بلا آلية.
 */

export type SmsRecipient = { id: number; name: string; phone: string; optOutAt: string | null };

/** العربي بيجبر UCS-2: 70 حرف للرسالة الواحدة، 67 لكل مقطع بالمتعددة. */
export function segments(text: string) {
  const chars = [...text].length;
  return chars <= 70 ? 1 : Math.ceil(chars / 67);
}

export { STOP_TOKEN } from "./token";
import { STOP_TOKEN } from "./token";

export function renderFor(body: string, memberId: number) {
  return body.split(STOP_TOKEN).join(shortOptOutLink(memberId));
}

/**
 * مين بينبعتله. بتشيل التكرار بين الملصقات، وبترفض الملصق من نوع
 * «مسار» — هو سجل لما اشتراه كل منتسب، مش قائمة إرسال.
 */
export function audienceFor(labelIds: number[]): { recipients: SmsRecipient[]; stopped: SmsRecipient[] } {
  if (!labelIds.length) {
    return { recipients: [], stopped: [] };
  }

  const db = getDb();
  const placeholders = labelIds.map(() => "?").join(",");
  const bad = db
    .prepare(`SELECT name FROM groups WHERE id IN (${placeholders}) AND kind = 'path'`)
    .all(...labelIds) as Array<{ name: string }>;
  if (bad.length) {
    throw new Error(`«${bad[0].name}» مسار مش دفعة — ما بينراسَل كقائمة.`);
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT m.id, m.name, m.phone, m.opt_out_at
         FROM members m JOIN member_groups mg ON mg.member_id = m.id
        WHERE mg.group_id IN (${placeholders})
        ORDER BY m.id`
    )
    .all(...labelIds) as Array<{ id: number; name: string; phone: string; opt_out_at: string | null }>;

  const all: SmsRecipient[] = rows.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    phone: row.phone ?? "",
    optOutAt: row.opt_out_at
  }));

  return {
    recipients: all.filter((person) => !isOptedOut(person as unknown as Member)),
    stopped: all.filter((person) => isOptedOut(person as unknown as Member))
  };
}
