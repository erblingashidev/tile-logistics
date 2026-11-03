"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AdministrationFinanceNav } from "@/components/administration/finance/AdministrationFinanceNav";

export function FinancePageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell title={title} description={description} contentMaxWidth="wide">
      <AdministrationFinanceNav />
      {children}
    </AppShell>
  );
}
