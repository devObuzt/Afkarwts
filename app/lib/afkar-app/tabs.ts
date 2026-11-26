/**
 * The screens of the «التطبيق» area, as tabs under the main nav. They used to
 * be cards on /new/app only — Afkar couldn't see the library screens existed.
 */
export const APP_TABS = [
  { href: "/new/app", label: "المنتسبون" },
  { href: "/new/app/queues", label: "طلبات تنتظر" },
  { href: "/new/app/foods", label: "الأطعمة" },
  { href: "/new/app/templates", label: "الوجبات" },
  { href: "/new/app/programs", label: "المسارات" },
  { href: "/new/app/exercises", label: "التمارين" }
] as const;

export type AppTabHref = (typeof APP_TABS)[number]["href"];

/** The tab a path belongs to: the root lights only on itself, sub-pages light their section. */
export function appTabOf(pathname: string): AppTabHref | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/new/app") return "/new/app";
  const tab = APP_TABS.find((t) => t.href !== "/new/app" && (path === t.href || path.startsWith(`${t.href}/`)));
  return tab ? tab.href : null;
}
