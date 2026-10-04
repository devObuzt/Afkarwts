"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Which of the four areas is open. It rides on the wrapper as a data
 * attribute so one CSS rule repaints the whole page — the nav pill, the rule
 * under the title, the card edges — without every page passing a colour down.
 */
export function areaOf(pathname: string) {
  if (pathname.startsWith("/new/people")) return "people";
  if (pathname.startsWith("/new/cohorts")) return "cohorts";
  if (pathname.startsWith("/new/library")) return "library";
  return "today";
}

export function AreaShell({ children }: { children: ReactNode }) {
  return (
    <div className="crm" data-area={areaOf(usePathname())} dir="rtl" lang="ar">
      {children}
    </div>
  );
}
