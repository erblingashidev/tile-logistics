"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AdministrationFinanceNav } from "@/components/administration/finance/AdministrationFinanceNav";
import { FinanceSearchBar } from "@/components/administration/finance/FinanceSearchProvider";
import { FinanceWorkflowGuide } from "@/components/administration/finance/FinanceWorkflowGuide";

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
      <FinanceWorkflowGuide />
      {children}
    </AppShell>
  );
}
