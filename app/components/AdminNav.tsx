"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  { href: "/", label: "Inbox" },
  { href: "/journeys", label: "Journeys" },
  { href: "/templates", label: "Templates" },
  { href: "/leads", label: "Leads" }
];

/**
 * One menu for the pages behind the login. The public registration form does
 * not carry it — whoever opens that link has nothing else here to reach.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="adminNav">
      {PAGES.map((page) => {
        const current = page.href === "/" ? pathname === "/" : pathname.startsWith(page.href);
        return (
          <Link aria-current={current ? "page" : undefined} className={current ? "current" : ""} href={page.href} key={page.href}>
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
