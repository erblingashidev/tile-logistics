"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AdministrationFinanceNav } from "@/components/administration/finance/AdministrationFinanceNav";
import { FinanceSearchBar } from "@/components/administration/finance/FinanceSearchProvider";

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
      <FinanceSearchBar />
      {children}
    </AppShell>
  );
}
