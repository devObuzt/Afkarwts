/**
 * إرسال SMS لملصقات مختارة.
 *
 * بلا `--go` = معاينة، زي كل أدوات البيت. المعاينة بتعرض العدد الفعلي
 * بعد شيل الموقّفين والتكرار، عدد المقاطع، وعيّنة من ثلاث رسائل كاملة
 * **بالرابط الحقيقي** — عشان يبيّن شو رح يوصل فعلاً.
 *
 * 🔑 كل مستلمة بتاخد **رابط هسرة خاص فيها** (`/s/<token>`): بيفتح نفس
 * صفحة الإيقاف، والكبسة بتسجّل الطلب بالمنظومة — نفس مبدأ الواتساب.
 * بلا هاد، سطر «للإيقاف» بيكون كلام بلا آلية: اسم المرسل `afkar` أبجدي
 * وما بينرد عليه.
 *
 * الاستعمال:
 *   npx tsx tools/sms-blast.ts --to "<ملصق>,<ملصق>"            # معاينة
 *   npx tsx tools/sms-blast.ts --only 0526993229               # لرقم واحد
 *   npx tsx tools/sms-blast.ts --to "..." --limit 10 --go      # دفعة محدودة
 */

import { appendFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "../app/lib/media-store";
import { getDb, type Member } from "../app/lib/db";
import { isOptedOut } from "../app/lib/members/opt-out";
import { shortOptOutLink } from "../app/lib/members/opt-out-token";
import { sendSms } from "../app/lib/sms";

/** النص المعتمد. `{{stop}}` بينبدل برابط كل مستلمة. */
export const BODY = `بلاك فرايدي أفكار 🖤
20% على Clean و Extra+
كود BLACKFRIDAY20 لحد 30.11
الدفعة الجاية 15.11
lp.connec.co.il/afkar_bf
للإيقاف: {{stop}}`;

function flag(name: string) {
  return process.argv.includes(name);
}
function value(name: string) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

/** العربي بيجبر ترميز UCS-2: 70 حرف للرسالة الواحدة، 67 لكل مقطع بالمتعددة. */
export function segments(text: string) {
  const chars = [...text].length;
  return chars <= 70 ? 1 : Math.ceil(chars / 67);
}

export function renderFor(member: Pick<Member, "id">) {
  return BODY.replace("{{stop}}", shortOptOutLink(member.id));
}

function audience(labels: string[]) {
  const db = getDb();
  const ids: number[] = [];
  for (const label of labels) {
    const row = db.prepare("SELECT id, kind FROM groups WHERE name = ?").get(label) as
      | { id: number; kind: string }
      | undefined;
    if (!row) {
      throw new Error(`ملصق مش موجود: «${label}»`);
    }
    if (row.kind === "path") {
      throw new Error(`«${label}» مسار مش دفعة — النظام بيرفضه كقائمة إرسال.`);
    }
    ids.push(row.id);
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT m.* FROM members m
         JOIN member_groups mg ON mg.member_id = m.id
        WHERE mg.group_id IN (${ids.map(() => "?").join(",")})
        ORDER BY m.id`
    )
    .all(...ids) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    optOutAt: (row.opt_out_at as string | null) ?? null
  }));
}

async function main() {
  const go = flag("--go");
  const limit = Number(value("--limit") || 0);
  const only = value("--only");

  let people = only
    ? (() => {
        const digits = only.replace(/\D/g, "").replace(/^0+/, "");
        const row = getDb()
          .prepare("SELECT * FROM members WHERE REPLACE(REPLACE(phone,'+',''),'-','') LIKE ?")
          .get(`%${digits}%`) as Record<string, unknown> | undefined;
        if (!row) throw new Error(`ما لقيت رقم بيطابق ${only}`);
        return [{ id: Number(row.id), name: String(row.name ?? ""), phone: String(row.phone ?? ""), optOutAt: (row.opt_out_at as string | null) ?? null }];
      })()
    : audience((value("--to") ?? "").split(",").map((item) => item.trim()).filter(Boolean));

  const stopped = people.filter((person) => isOptedOut(person as unknown as Member));
  people = people.filter((person) => !isOptedOut(person as unknown as Member));

  const sample = renderFor(people[0] ?? { id: 1 });
  console.log(`\nالنص (${[...sample].length} حرف · ${segments(sample)} مقطع):`);
  console.log("─".repeat(58));
  console.log(sample);
  console.log("─".repeat(58));
  console.log(`\nمستلمات: ${people.length}   ·   انشالوا لأنهم طلبوا إيقاف: ${stopped.length}`);
  console.log(`إجمالي الرسائل: ${people.length * segments(sample)}`);

  const batch = limit ? people.slice(0, limit) : people;
  if (limit) console.log(`\n⏸  محدود بـ${limit} من ${people.length}`);

  if (!go) {
    console.log("\n— عيّنة، كل وحدة برابطها —");
    for (const person of batch.slice(0, 3)) {
      console.log(`\n   ${person.name || person.phone} (${person.phone})`);
      console.log(`   ${shortOptOutLink(person.id)}`);
    }
    console.log("\nمعاينة. للإرسال الفعلي ضيف --go\n");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const person of batch) {
    const text = renderFor(person);
    try {
      const id = await sendSms(person.phone, text);
      sent += 1;
      appendFileSync(
        path.join(getDataDir(), "sms_log.jsonl"),
        JSON.stringify({ at: new Date().toISOString(), memberId: person.id, phone: person.phone, ok: true, id, segments: segments(text) }) + "\n"
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      appendFileSync(
        path.join(getDataDir(), "sms_log.jsonl"),
        JSON.stringify({ at: new Date().toISOString(), memberId: person.id, phone: person.phone, ok: false, error: message }) + "\n"
      );
      console.error(`🔴 ${person.phone} — ${message}`);
    }
  }
  console.log(`\nانبعت: ${sent} · فشل: ${failed}\n`);
}

if (process.argv[1]?.includes("sms-blast")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
