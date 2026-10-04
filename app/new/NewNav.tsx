"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaOf } from "./AreaShell";

const AREAS = [
  { href: "/new", area: "today", label: "اليوم" },
  { href: "/new/people", area: "people", label: "الناس" },
  { href: "/new/cohorts", area: "cohorts", label: "الدورات" },
  { href: "/new/library", area: "library", label: "المكتبة" }
];

export function NewNav() {
  const current = areaOf(usePathname());

  return (
    <header className="crmNav">
      <span className="crmBrand">أفكار</span>
      <nav aria-label="الأقسام">
        {AREAS.map((item) => (
          <Link
            aria-current={item.area === current ? "page" : undefined}
            className={item.area === current ? "current" : ""}
            data-area={item.area}
            href={item.href}
            key={item.href}
          >
            <span className="tick" />
            {item.label}
          </Link>
        ))}
      </nav>
      <a className="crmOld" href="/">
        الواجهة القديمة
      </a>
    </header>
  );
}
