import type { ReactNode } from "react";
import { AppTabs } from "./AppTabs";

export default function AppAreaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppTabs />
      {children}
    </>
  );
}
