import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { listGroups } from "@/app/lib/db";
import { ImportMembers } from "./ImportMembers";

export const dynamic = "force-dynamic";

/**
 * Bringing a list of people in.
 *
 * It only ever existed as a modal on the old English inbox, which is where
 * the one step that takes a whole cohort at once was hardest to find.
 */
export default async function ImportPage() {
  await requireUser("people.edit");

  return (
    <div className="crmPage">
      <Link className="crmBack" href="/new/people">
        ← المنتسبون
      </Link>

      <header className="crmHead">
        <h1>استيراد منتسبين</h1>
        <p>
          الصقي اللائحة أو ارفعي ملف. المهم الرقم — الاسم والملاحظات إذا كانوا موجودين منوخدهن، وإذا لأ
          بيمشي الحال.
        </p>
      </header>

      <ImportMembers
        groups={listGroups().map((group) => ({
          id: group.id,
          name: group.name,
          memberCount: group.memberCount
        }))}
      />
    </div>
  );
}
