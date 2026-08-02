import { NextResponse } from "next/server";
import { addMembersToGroup, createMember, findMemberByPhone, getGroup } from "@/app/lib/db";

export const runtime = "nodejs";

type ImportRow = {
  name?: string;
  phone?: string;
  notes?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows?: ImportRow[]; groupId?: number | null };
    const rows = body.rows ?? [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows to import." }, { status: 400 });
    }

    if (rows.length > 2000) {
      return NextResponse.json({ error: "Import is limited to 2000 rows at a time." }, { status: 400 });
    }

    const groupId = body.groupId ? Number(body.groupId) : null;
    if (groupId && !getGroup(groupId)) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    let created = 0;
    let existing = 0;
    const failed: Array<{ row: ImportRow; error: string }> = [];
    const affectedMemberIds: number[] = [];

    for (const row of rows) {
      const phone = row.phone?.trim() ?? "";
      const name = row.name?.trim() || phone;

      if (!phone) {
        failed.push({ row, error: "Missing phone number." });
        continue;
      }

      try {
        const found = findMemberByPhone(phone);
        if (found) {
          existing += 1;
          affectedMemberIds.push(found.id);
          continue;
        }

        const member = createMember({ name, phone, notes: row.notes ?? "" });
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
