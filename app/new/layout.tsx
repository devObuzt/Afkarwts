import type { ReactNode } from "react";
import { AreaShell } from "./AreaShell";
import { NewNav } from "./NewNav";
import "./crm.css";

/**
 * The rebuilt surface, served beside the old one rather than over it: the
 * current pages keep working untouched while this is checked against real
 * data, and the switch is a redirect when it is ready.
 */
export default function NewLayout({ children }: { children: ReactNode }) {
  return (
    <AreaShell>
      <NewNav />
      <div className="crmBody">{children}</div>
    </AreaShell>
  );
}
