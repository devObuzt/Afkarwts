import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { Campaigns } from "./Campaigns";

export const dynamic = "force-dynamic";

/**
 * Campaigns, moved out of a modal in the old inbox.
 *
 * A campaign runs for days on its own — a batch a morning, a Telegram
 * report after each one — so the one screen that says how far it has got
 * should be a place you can open, link to and leave open, not something
 * that vanishes when a dialog closes.
 */
export default async function CampaignsPage() {
  const user = await requireUser("messages.send");

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>الحملات</h1>
        <p>
          كل حملة بتمشي لحالها — دفعة باليوم وتقرير تلجرام بعد كل وحدة. هون بتشوفي وين وصلت، ومين ما
          وصلته، وليش.
        </p>
      </header>

      <Campaigns canSend={can(user, "messages.send")} />
    </div>
  );
}
