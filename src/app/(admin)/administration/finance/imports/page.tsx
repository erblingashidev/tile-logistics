"use client";

import Link from "next/link";
import { AdministrationFinanceImport } from "@/components/administration/AdministrationFinanceImport";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { Button } from "@/components/ui";

export default function AdministrationFinanceImportsPage() {
  return (
    <FinancePageShell
      title="Finance import"
      description="Upload Excel exports from your official finance system. Column preview works today; mapped import into debts, sales, and expenses comes with your sample files."
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
