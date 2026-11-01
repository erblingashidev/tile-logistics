"use client";

import { useAdminSession } from "@/components/layout/AdminSessionProvider";
import { CashierAppShell } from "@/components/layout/CashierAppShell";

/** Persistent invoicing-office chrome (must sit inside OrgPath + CompanyProfile providers). */
export function CashierChrome({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  if (session?.shellMode !== "cashier") {
    return children;
  }
  return <CashierAppShell session={session}>{children}</CashierAppShell>;
}
