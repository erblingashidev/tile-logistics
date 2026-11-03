"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AdministrationFinanceNav } from "@/components/administration/finance/AdministrationFinanceNav";
import { FinanceSearchProvider } from "@/components/administration/finance/FinanceSearchProvider";

function FinancePageBody({
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
      <FinanceSearchProvider>{children}</FinanceSearchProvider>
    </AppShell>
  );
}

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
    <Suspense
      fallback={
        <AppShell title={title} description={description} contentMaxWidth="wide">
          <p className="text-sm text-zinc-500">Loading finance…</p>
        </AppShell>
      }
    >
      <FinancePageBody title={title} description={description}>
        {children}
      </FinancePageBody>
    </Suspense>
  );
}
