"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { AdministrationFinanceImport } from "@/components/administration/AdministrationFinanceImport";
import { Button } from "@/components/ui";

export default function AdministrationFinanceImportsPage() {
  return (
    <AppShell
      title="Finance import"
      description="Upload Excel exports from your official finance system — preview columns today; full import after we align on your file format."
      contentMaxWidth="wide"
    >
      <div className="mb-6">
        <Link href="/administration/finance">
          <Button variant="secondary">← Back to finance</Button>
        </Link>
      </div>
      <AdministrationFinanceImport />
    </AppShell>
  );
}
