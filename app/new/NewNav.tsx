"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaOf } from "./AreaShell";

const AREAS = [
  { href: "/new", area: "today", label: "اليوم" },
  { href: "/new/people", area: "people", label: "المنتسبون" },
  { href: "/new/paths", area: "paths", label: "المسارات" },
  { href: "/new/library", area: "library", label: "المكتبة" },
  { href: "/new/income", area: "income", label: "الدخل" },
  { href: "/new/users", area: "users", label: "المستخدمون" }
];

export function NewNav({
  canManageUsers,
  canSeeIncome,
  me
}: {
  canManageUsers: boolean;
  canSeeIncome: boolean;
  me: string;
}) {
  const current = areaOf(usePathname());
  const areas = AREAS.filter(
    (item) =>
      (item.area !== "users" || canManageUsers) && (item.area !== "income" || canSeeIncome)
  );

  return (
    <header className="crmNav">
      <span className="crmBrand">أفكار</span>
      <nav aria-label="الأقسام">
        {areas.map((item) => (
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
      <span className="crmWho">
        <a href="/password" title="تغيير كلمة المرور">
          {me}
        </a>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          type="button"
        >
          خروج
        </button>
      </span>
      <a className="crmOld" href="/">
        السابقة
      </a>
    </header>
  );
}
