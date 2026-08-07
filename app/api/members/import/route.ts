import { NextResponse } from "next/server";
import { addMembersToGroup, createMember, findMemberByPhone, getGroup, normalizeImportPhone } from "@/app/lib/db";

export const runtime = "nodejs";

type ImportRow = {
  name?: string;
  phone?: string;
  notes?: string;
  city?: string;
  joined?: string;
  service?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows?: ImportRow[]; groupId?: number | null };
    const rows = body.rows ?? [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows to import." }, { status: 400 });
    }

    if (rows.length > 2000) {
      return NextResponse.json({ error: "Import is limited to 2000 rows per request." }, { status: 400 });
    }

    const groupId = body.groupId ? Number(body.groupId) : null;
    if (groupId && !getGroup(groupId)) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    let created = 0;
    let existing = 0;
    const failed: Array<{ row: ImportRow; error: string }> = [];
    const affectedMemberIds: number[] = [];
    const seenPhones = new Set<string>();

    for (const row of rows) {
      const rawPhone = row.phone?.trim() ?? "";

      if (!rawPhone) {
        failed.push({ row, error: "Missing phone number." });
        continue;
      }

      let phone = "";
      try {
        phone = normalizeImportPhone(rawPhone);
      } catch (error) {
        failed.push({ row, error: error instanceof Error ? error.message : "Invalid phone number." });
        continue;
      }

      if (!phone || phone.length < 8) {
        failed.push({ row, error: "Invalid phone number." });
        continue;
      }

      if (seenPhones.has(phone)) {
        existing += 1;
        continue;
      }
      seenPhones.add(phone);

      const name = row.name?.trim() || phone;

      try {
        const found = findMemberByPhone(phone);
        if (found) {
          existing += 1;
          affectedMemberIds.push(found.id);
          continue;
        }

        const member = createMember({
          name,
          phone,
          notes: row.notes ?? "",
          city: row.city ?? "",
          joined: row.joined ?? "",
          service: row.service ?? ""
        });
        if (member) {
          created += 1;
          affectedMemberIds.push(member.id);
        }
      } catch (error) {
        failed.push({ row, error: error instanceof Error ? error.message : "Could not import row." });
      }
    }

    if (groupId && affectedMemberIds.length) {
      addMembersToGroup(groupId, affectedMemberIds);
    }

    return NextResponse.json({ created, existing, failed });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
