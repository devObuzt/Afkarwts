import { requireUser } from "@/app/lib/users/current";
import { listGroups } from "@/app/lib/db";
import { BulkSend } from "./BulkSend";

export const dynamic = "force-dynamic";

/**
 * The bulk send, out of a modal and onto a page.
 *
 * It is the heaviest thing anybody does here — a group of thousands, a
 * template, a daily ceiling — and it was a dialog you could close by
 * accident mid-send. A page can be linked to, left open, and come back to.
 */
export default async function BulkPage() {
  await requireUser("messages.send");

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>إرسال جماعي</h1>
        <p>اختاري مجموعة، اكتبي الرسالة، وشوفي شو رح يصير قبل ما يصير.</p>
      </header>

      <BulkSend groups={listGroups().map((group) => ({ id: group.id, name: group.name, memberCount: group.memberCount }))} />
    </div>
  );
}
