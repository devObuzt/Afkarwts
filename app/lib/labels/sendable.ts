import { getDb } from "../db";
import { MANAGED_INVOICE } from "./kinds";

/**
 * Whether a whole label may be messaged at once.
 *
 * Two of them may not, and both are new as of 2026-10-11:
 *
 *  - A **مسار** is written onto everybody whose Morning invoice names it.
 *    «CLEAN» is six hundred people spanning two years, not a cohort; it is
 *    a record of what each one bought.
 *  - **«زبون من فاتورة»** is the 545 contacts created from invoices. They
 *    never filled a form and never consented to anything. The label exists
 *    to say so, and a bulk send to it is the one thing it must prevent.
 *
 * Picking one person out of either and writing to her is a decision about
 * a person and stays allowed. This is only about the whole list at once.
 */
export function groupSendable(groupId: number) {
  const row = getDb().prepare("SELECT kind, managed, name FROM groups WHERE id = ?").get(groupId) as
    | { kind: string; managed: string; name: string }
    | undefined;

  if (!row) {
    return { ok: false as const, error: "المجموعة غير موجودة." };
  }

  if (row.kind === "path") {
    return {
      ok: false as const,
      error: `«${row.name}» مسار وليس دفعة: هو سجل لما اشتراه كل منتسب، ويحمله كل من ذُكر المسار في فاتورته. اختر دفعة.`
    };
  }

  if (row.managed === MANAGED_INVOICE) {
    return {
      ok: false as const,
      error: `«${row.name}» جهات أُنشئت من فواتير Morning ولم تسجّل ولم توافق على تلقّي رسائل. لا تُراسَل كقائمة.`
    };
  }

  return { ok: true as const };
}
