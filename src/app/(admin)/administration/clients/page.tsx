"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AdministrationClientFinance } from "@/components/administration/AdministrationClientFinance";
import { PageSection } from "@/components/ui";

export default function AdministrationClientsPage() {
  return (
    <AppShell
      title="Clients & debts"
      description="Outstanding balances, follow-up lists, overdue by sales agent, and printable client cards."
      contentMaxWidth="wide"
    >
      <PageSection title="Debts & client follow-up">
        <AdministrationClientFinance />
      </PageSection>
    </AppShell>
  );
}
