"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import {
  AdministrationFinanceOverview,
  type FinanceOverviewData,
} from "@/components/administration/AdministrationFinanceOverview";
import { AdministrationFinanceReport } from "@/components/administration/AdministrationFinanceReport";
import {
  ClosedRegisterSessionsTable,
  type ClosedRegisterSession,
} from "@/components/administration/RegisterShiftReconciliation";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Button, Card, Input, PageSection } from "@/components/ui";

export default function AdministrationFinancePage() {
  const t = useAppMessages();
  const p = t.finance.pages.register;
  const c = t.finance.common;
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
    <FinancePageShell title={p.title} description={p.description}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <PageSection title={p.overviewTitle} className="mb-8">
        <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <Input
            label={c.from}
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
          <Input
            label={c.to}
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" onClick={() => void refreshSummary()}>
              {c.applyPeriod}
            </Button>
            <Button variant="secondary" onClick={exportLedgerCsv}>
              {c.exportCsv}
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

      <PageSection title={p.shiftCloseTitle} className="mb-8">
        <Card className="p-4">
          <p className="mb-3 text-sm text-zinc-600">{p.shiftCloseHint}</p>
          <ClosedRegisterSessionsTable sessions={closedSessions} />
        </Card>
      </PageSection>

      <AdministrationFinanceReport
        defaultDateFrom={filterFrom}
        defaultDateTo={filterTo}
      />
    </FinancePageShell>
  );
}
