import { getDb, getMember, type Member } from "../db";
import { hebrewNameFor } from "../forms/hebrew-name";
import { ensureManagedLabel, addLabel } from "../labels/store";
import { linkPayment } from "./payment-match";

/**
 * تحويل عضو نادي إلى **منتسب**.
 *
 * 🔑 المرحلة على نفس الصف مش جدول تاني (قرار وسام 01.11) — نفس الإنسان
 * ونفس المحادثة ونفس التاريخ. التحويل بيغيّر `stage` وبيعلّق المنتجات
 * كملصقات، وبيربط الدفعة اللي وثّقها الأدمن.
 *
 * كل شي بترانزكشن وحدة: منتسب نصّه متحوّل — مرحلته تغيّرت وملصقاته لأ —
 * بيصير صفّ بيرد على بعض الاستعلامات وبس.
 */

export type ConvertInput = {
  memberId: number;
  /** الاسم كما صحّحه الأدمن بالبوب-أب. */
  name: string;
  /** الاسم العبري — مقترح آلياً وقابل للتعديل. */
  hebrewName: string;
  paid: boolean;
  /** رمز وسيلة الدفع من مورنينج، أو `null` لغير الدافع. */
  method: number | null;
  /** دفعة مورنينج اللي وثّقها الأدمن من بين الاحتمالات. */
  paymentId: number | null;
  /** المنتجات المختارة — بتنحفظ كملصقات. */
  products: string[];
};

export type ConvertResult =
  | { ok: true; member: Member; labels: string[]; linkedPayment: boolean }
  | { ok: false; error: string };

export function convertToMember(input: ConvertInput, byUserId: number): ConvertResult {
  const existing = getMember(input.memberId);
  if (!existing) {
    return { ok: false, error: "هذا الشخص غير موجود." };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "الاسم مطلوب." };
  }

  const products = input.products.map((item) => item.trim()).filter(Boolean);
  if (!products.length) {
    return { ok: false, error: "اختاري منتَجاً واحداً على الأقل." };
  }

  // الاسم العبري: اللي كتبه الأدمن بيغلب، وإذا تركه فاضي بنقترح.
  const hebrew = input.hebrewName.trim() || hebrewNameFor(name);

  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE members
          SET name = ?, hebrew_name = ?, stage = 'member',
              became_member_at = COALESCE(became_member_at, CURRENT_TIMESTAMP)
        WHERE id = ?`
    ).run(name, hebrew, input.memberId);

    for (const product of products) {
      // الملصق بينعمل إذا مش موجود (قرار وسام 01.11) — المنتَج بيصير
      // مرئي على المحادثة فوراً بلا ما حدا يجهّز شي مسبقاً.
      const label = ensureManagedLabel(product, "path");
      addLabel(input.memberId, label.id, true);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: error instanceof Error ? error.message : "ما زبط التحويل." };
  }

  // الربط برّا الترانزكشن: فشله ما بيستاهل يلغي التحويل كله — الدفعة
  // بتنربط بعدين، والمنتسب صار منتسب.
  const linkedPayment = input.paymentId ? linkPayment(input.paymentId, input.memberId) : false;

  void byUserId;
  return { ok: true, member: getMember(input.memberId)!, labels: products, linkedPayment };
}
