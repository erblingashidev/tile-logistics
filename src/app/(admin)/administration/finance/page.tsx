"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/AppShell";
import {
  AdministrationFinanceOverview,
  type FinanceOverviewData,
} from "@/components/administration/AdministrationFinanceOverview";
import { AdministrationFinanceReport } from "@/components/administration/AdministrationFinanceReport";
import {
  ClosedRegisterSessionsTable,
  type ClosedRegisterSession,
} from "@/components/administration/RegisterShiftReconciliation";
import { Alert, Button, Card, Input, PageSection } from "@/components/ui";

export default function AdministrationFinancePage() {
  const [filterFrom, setFilterFrom] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [filterTo, setFilterTo] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);
  const [closedSessions, setClosedSessions] = useState<ClosedRegisterSession[]>(
    []
  );
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    const res = await fetch(`/api/administration/overview?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setOverview(data.overview ?? null);
  }, [filterFrom, filterTo]);

  const loadClosedSessions = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    const res = await fetch(`/api/administration/register?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setClosedSessions(data.sessions ?? []);
  }, [filterFrom, filterTo]);

  const refreshSummary = useCallback(async () => {
    setError("");
    try {
      await Promise.all([loadOverview(), loadClosedSessions()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [loadOverview, loadClosedSessions]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  function exportLedgerCsv() {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    window.location.href = `/api/administration/export?${params}`;
  }

  return (
    <AppShell
      title="Finance"
      description="Payment tracking, KPIs, reconciliation, reports, Excel import, and client follow-up (separate from the cash register)."
      contentMaxWidth="wide"
    >
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-zinc-600">
          Roadmap: daily sales grid (client, agent, product, payment method, debt),
          expense import, and PDF/Excel reports like your Finance Core exports.
        </p>
        <Link href="/administration/finance/imports">
          <Button variant="secondary">Import Excel…</Button>
        </Link>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <PageSection title="Finance overview" className="mb-8">
        <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <Input
            label="From"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" onClick={() => void refreshSummary()}>
              Apply period
            </Button>
            <Button variant="secondary" onClick={exportLedgerCsv}>
              Export CSV
            </Button>
          </div>
        </Card>
        <AdministrationFinanceOverview
          overview={overview}
          periodLabel={`Summary for ${filterFrom}${
            filterTo && filterTo !== filterFrom ? ` → ${filterTo}` : ""
          }`}
        />
      </PageSection>

      <PageSection title="Shift close results" className="mb-8">
        <Card className="p-4">
          <p className="mb-3 text-sm text-zinc-600">
            Compare counted cash to expected (opening float + cash in − cash out)
            for each closed shift in the period above.
          </p>
          <ClosedRegisterSessionsTable sessions={closedSessions} />
        </Card>
      </PageSection>

      <AdministrationFinanceReport
        defaultDateFrom={filterFrom}
        defaultDateTo={filterTo}
      />
    </AppShell>
  );
}
