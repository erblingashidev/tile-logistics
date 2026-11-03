"use client";

import Link from "next/link";
import { AdministrationFinanceImport } from "@/components/administration/AdministrationFinanceImport";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { Button } from "@/components/ui";

export default function AdministrationFinanceImportsPage() {
  return (
    <FinancePageShell
      title="Finance import"
      description="Import Pro-Data Libri i transaksioneve — sales, credit notes, agents, and debts stay aligned with your finance system."
    >
      <div className="mb-6">
        <Link href="/administration/finance/reports">
          <Button variant="secondary">← Overall reports</Button>
        </Link>
      </div>
      <AdministrationFinanceImport />
    </FinancePageShell>
  );
}
