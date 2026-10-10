import type { ReactNode } from "react";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { AreaShell } from "./AreaShell";
import { NewNav } from "./NewNav";
import { WhatsAppWidget } from "./whatsapp/WhatsAppWidget";
import "./crm.css";

/**
 * The workspace: the system on the left, WhatsApp on the right.
 *
 * WhatsApp stopped being the centre — it is a channel now — but it is
 * still where the work arrives, so it sits beside the record rather than
 * on another page. Three columns at Wisam's proportions: 60% for the
 * system, 25% for the open conversation, 15% for the rail of threads and
 * search. Below a laptop the widget drops under the page, because a
 * fifteen-percent rail on a phone is a stripe.
 */
export default async function NewLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <AreaShell>
      <NewNav
        canManageUsers={can(user, "users.manage")}
        canSeeIncome={can(user, "income.view")}
        me={user.name}
      />
      <div className="crmWork">
        <div className="crmBody">{children}</div>
        <WhatsAppWidget canSend={can(user, "messages.send")} />
      </div>
    </AreaShell>
  );
}
