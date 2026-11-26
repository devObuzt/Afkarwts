"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_TABS, appTabOf } from "@/app/lib/afkar-app/tabs";

export function AppTabs() {
  const current = appTabOf(usePathname());
  return (
    <nav aria-label="أقسام التطبيق" className="crmSubnav">
      {APP_TABS.map((tab) => (
        <Link
          aria-current={tab.href === current ? "page" : undefined}
          className={tab.href === current ? "current" : ""}
          href={tab.href}
          key={tab.href}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
