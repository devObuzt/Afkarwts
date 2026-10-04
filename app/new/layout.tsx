import type { ReactNode } from "react";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { AreaShell } from "./AreaShell";
import { NewNav } from "./NewNav";
import "./crm.css";

/**
 * The rebuilt surface, served beside the old one rather than over it: the
 * current pages keep working untouched while this is checked against real
 * data, and the switch is a redirect when it is ready.
 */
export default async function NewLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <AreaShell>
      <NewNav canManageUsers={can(user, "users.manage")} me={user.name} />
      <div className="crmBody">{children}</div>
    </AreaShell>
  );
}
