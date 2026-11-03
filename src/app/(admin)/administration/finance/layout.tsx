"use client";

import { Suspense, type ReactNode } from "react";
import { FinanceSearchProvider } from "@/components/administration/finance/FinanceSearchProvider";

export default function AdministrationFinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-zinc-500">Loading finance…</p>
      }
    >
      <FinanceSearchProvider>{children}</FinanceSearchProvider>
    </Suspense>
  );
}
