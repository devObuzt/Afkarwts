import { getDb, normalizePhone, type Member } from "../db";

/**
 * دور على دفعات مورنينج اللي ممكن تكون لهاد الشخص.
 *
 * 🔑 **بترجّع احتمالات مش حكم** (قرار وسام 01.11). الأدمن بيشوف اللائحة
 * وبيوثّق وحدة. السبب مش حذر زايد: المطابقة بالاسم لحالها عملت **10
 * حسابات مكرّرة** عند كو أكاديمي، و«ريم» بالقائمة أربع مرات.
 *
 * الترتيب:
 *   1. **الرقم** — أدقّ شي عنا، وبينطبّع قبل المقارنة فـ`052…` و`+97252…`
 *      بينلاقوا بعض.
 *   2. **الاسم** — مرشّح ثاني وبس، وبينعرض معلّم إنه بالاسم.
 */

export type PaymentCandidate = {
  id: number;
  morningId: string;
  number: string;
  paidOn: string;
  amount: number;
  methods: number[];
  clientName: string;
  clientPhone: string;
  /** على شو انلاقى: الرقم أقوى من الاسم. */
  matchedBy: "phone" | "name";
  /** مربوط بحدا تاني أصلاً — بيتعرض وبينعلّم، وما بينسرق بالغلط. */
  takenBy: { id: number; name: string } | null;
};

type Row = Record<string, string | number | null>;

/** «ريم أبو حسن» و«ريم ابو حسن» ولفظ واحد. */
function flatten(name: string) {
  return (name ?? "")
    .trim()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function map(row: Row, matchedBy: "phone" | "name"): PaymentCandidate {
  let methods: number[] = [];
  try {
    const parsed = JSON.parse(String(row.methods ?? "[]"));
    methods = Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    methods = [];
  }
  return {
    id: Number(row.id),
    morningId: String(row.morning_id ?? ""),
    number: String(row.number ?? ""),
    paidOn: String(row.paid_on ?? ""),
    amount: Number(row.amount ?? 0),
    methods,
    clientName: String(row.client_name ?? ""),
    clientPhone: String(row.client_phone ?? ""),
    matchedBy,
    takenBy:
      row.member_id && Number(row.member_id) !== Number(row.for_member)
        ? { id: Number(row.member_id), name: String(row.taken_name ?? "") }
        : null
  };
}

const SELECT = `SELECT p.id, p.morning_id, p.number, p.paid_on, p.amount, p.methods,
                       p.client_name, p.client_phone, p.member_id,
                       m.name AS taken_name, ? AS for_member
                  FROM payments p LEFT JOIN members m ON m.id = p.member_id`;

export function paymentCandidates(member: Member, limit = 8): PaymentCandidate[] {
  const db = getDb();
  let phone = member.phone;
  try {
    phone = normalizePhone(member.phone);
  } catch {
    // رقم ما بينطبّع بيضل ينبحث عنه كما هو.
  }
  const digits = phone.replace(/\D/g, "");
  // آخر تسع خانات: بتتجاوز اختلاف 0 و+972 و00972 بلا ما تخلط رقمين.
  const tail = digits.slice(-9);

  const byPhone = tail
    ? (db
        .prepare(
          `${SELECT} WHERE p.client_phone <> ''
             AND REPLACE(REPLACE(REPLACE(p.client_phone,'+',''),'-',''),' ','') LIKE ?
           ORDER BY p.paid_on DESC LIMIT ?`
        )
        .all(member.id, `%${tail}`, limit) as Row[])
    : [];

  const found = new Set(byPhone.map((row) => Number(row.id)));
  const name = flatten(member.name);

  // الاسم بينبحث عنه بس إذا هو اسم فعلاً — الرقم بينحفظ كاسم للي ما إلهم اسم.
  const byName =
    name.length >= 4 && !/^\+?\d+$/.test(name)
      ? (db
          .prepare(`${SELECT} WHERE p.client_name <> '' ORDER BY p.paid_on DESC LIMIT 400`)
          .all(member.id) as Row[]
        )
          .filter((row) => {
            if (found.has(Number(row.id))) {
              return false;
            }
            const other = flatten(String(row.client_name ?? ""));
            return other === name || other.includes(name) || name.includes(other);
          })
          .slice(0, limit)
      : [];

  return [...byPhone.map((row) => map(row, "phone")), ...byName.map((row) => map(row, "name"))];
}

/** ربط دفعة بمنتسب — بعد ما الأدمن يوثّق. */
export function linkPayment(paymentId: number, memberId: number) {
  const changed = getDb()
    .prepare("UPDATE payments SET member_id = ? WHERE id = ?")
    .run(memberId, paymentId).changes;
  return Number(changed) > 0;
}
