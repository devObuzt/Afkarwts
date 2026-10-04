import type { ReactNode } from "react";
import { requireUser } from "@/app/lib/users/current";

/** Guards the page on the server, before any of it is rendered. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireUser("journeys.view");
  return <>{children}</>;
}
