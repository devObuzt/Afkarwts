import { createMember, getDb, normalizePhone } from "../db";
import { MANAGED_INVOICE } from "../labels/kinds";
import { addLabel, ensureManagedLabel, ensurePathLabel } from "../labels/store";
import { pathsOf } from "./catalogue";

/**
 * The people Morning already knows and this system did not.
 *
 * Measured 2026-10-11: 3,422 paid invoices, 1,541 tied to a منتسب, and
 * **613 more carrying a phone that matched nobody** — 545 distinct people
 * who paid Afkar and had no record here. Every one of them has a name on
 * the invoice, and every phone is already in +972 form.
 *
 * Wisam's decision: create them. The cost is that these contacts never
 * filled a form and never consented, so two rules hold:
 *
 *  1. They carry «زبون من فاتورة», which says exactly where they came from.
 *  2. **Nothing adds them to a مسار batch or a running journey.** The مسار
 *     label on them is a record of what they bought, not an enrolment, so
 *     no scheduler ever picks them up.
 */
export function adoptInvoiceContacts(limit = 2000) {
  const db = getDb();

  // One row per person, with the name from their most recent invoice: a
  // woman who paid four times should become one record, not four.
  const rows = db
    .prepare(
      // SQLite takes the bare columns from the row that MAX() picked, so
      // the name is the one on her latest invoice, not an arbitrary one.
      `SELECT client_phone AS phone, client_name AS name, MAX(paid_on) AS last
         FROM payments
        WHERE member_id IS NULL
          AND TRIM(client_phone) <> ''
          AND TRIM(client_name) <> ''
          AND NOT EXISTS (SELECT 1 FROM members WHERE members.phone = payments.client_phone)
        GROUP BY client_phone
        ORDER BY last DESC
        LIMIT ?`
    )
    .all(limit) as Array<{ phone: string; name: string; last: string }>;

  if (rows.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const label = ensureManagedLabel(MANAGED_INVOICE, "other");

  let created = 0;
  let skipped = 0;

  // Five hundred and forty-five inserts, each its own write without this:
  // on WAL that is five hundred and forty-five fsyncs while the rest of
  // the app wants the file.
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      let phone = "";
      try {
        phone = normalizePhone(row.phone);
      } catch {
        skipped += 1;
        continue;
      }

      // createMember refuses a number under eight characters, and an invoice
      // can carry a landline or a typo. A refusal is not a failed sync.
      if (!phone || phone.replace(/\D/g, "").length < 8) {
        skipped += 1;
        continue;
      }

      try {
        const member = createMember({ name: row.name.trim(), phone, notes: "أُنشئ من فاتورة Morning." });
        if (member) {
          // byHand = false: the system put it on, so a hand can take it off.
          addLabel(member.id, label.id, false);
          created += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { created, skipped };
}

/**
 * The مسار each منتسب has actually paid for, read off their invoices.
 *
 * Only ever adds. A label taken off by hand stays off — the same rule the
 * managed states follow, because the invoice is evidence and not an order.
 */
export function applyPathLabels() {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT member_id AS memberId, items FROM payments
        WHERE member_id IS NOT NULL AND items <> '[]' AND items <> ''`
    )
    .all() as Array<{ memberId: number; items: string }>;

  const wanted = new Map<number, Set<string>>();
  for (const row of rows) {
    let items: string[] = [];
    try {
      items = JSON.parse(row.items) as string[];
    } catch {
      continue;
    }
    for (const path of pathsOf(items)) {
      const set = wanted.get(row.memberId) ?? new Set<string>();
      set.add(path);
      wanted.set(row.memberId, set);
    }
  }

  if (wanted.size === 0) {
    return { applied: 0, paths: 0 };
  }

  const labelIds = new Map<string, number>();
  for (const set of wanted.values()) {
    for (const path of set) {
      if (!labelIds.has(path)) {
        labelIds.set(path, ensurePathLabel(path).id);
      }
    }
  }

  const already = new Set(
    (
      db
        .prepare(
          `SELECT member_id AS m, group_id AS g FROM member_groups
            WHERE group_id IN (${[...labelIds.values()].map(() => "?").join(",")})`
        )
        .all(...labelIds.values()) as Array<{ m: number; g: number }>
    ).map((row) => `${row.m}:${row.g}`)
  );

  let applied = 0;
  db.exec("BEGIN");
  try {
    for (const [memberId, paths] of wanted) {
      for (const path of paths) {
        const labelId = labelIds.get(path)!;
        if (already.has(`${memberId}:${labelId}`)) {
          continue;
        }
        if (addLabel(memberId, labelId, false)) {
          applied += 1;
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { applied, paths: labelIds.size };
}
