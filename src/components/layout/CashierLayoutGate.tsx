"use client";

import { useAdminSession } from "@/components/layout/AdminSessionProvider";
import { CashierAppShell } from "@/components/layout/CashierAppShell";

/** Keeps invoicing-office chrome mounted across client navigations. */
export function CashierLayoutGate({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  if (session?.shellMode !== "cashier") {
    return children;
  }
  return <CashierAppShell session={session}>{children}</CashierAppShell>;
}
