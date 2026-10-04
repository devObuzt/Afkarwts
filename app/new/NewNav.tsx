"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const AREAS = [
  { href: "/new", label: "اليوم" },
  { href: "/new/people", label: "الناس" },
  { href: "/new/cohorts", label: "الدورات" },
  { href: "/new/library", label: "المكتبة" }
];

export function NewNav() {
  const pathname = usePathname();

  return (
    <header className="crmNav">
      <span className="crmBrand">Afkar</span>
      <nav aria-label="الأقسام">
        {AREAS.map((area) => {
          const current = area.href === "/new" ? pathname === "/new" : pathname.startsWith(area.href);
          return (
            <Link aria-current={current ? "page" : undefined} className={current ? "current" : ""} href={area.href} key={area.href}>
              {area.label}
            </Link>
          );
        })}
      </nav>
      <a className="crmOld" href="/">
        الواجهة القديمة
      </a>
    </header>
  );
}
