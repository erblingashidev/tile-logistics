"use client";

import { Button, Select } from "@/components/ui";
import { useFinanceSearch } from "@/components/administration/finance/FinanceSearchProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { debtInvoiceMatchesSearch } from "@/lib/administration/finance-search";
import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";

export function FinanceDebtFilters({
  agent,
  onAgentChange,
  agentOptions,
  minDays,
  onMinDaysChange,
  showMinDays = true,
  onClear,
}: {
  agent: string;
  onAgentChange: (v: string) => void;
  agentOptions: string[];
  minDays: string;
  onMinDaysChange: (v: string) => void;
  showMinDays?: boolean;
  onClear: () => void;
}) {
  const t = useAppMessages();
  const f = t.finance.filters;
  const { query, clearQuery } = useFinanceSearch();
  const hasFilter =
    Boolean(agent) || Boolean(query.trim()) || (showMinDays && minDays !== "0");

  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label={f.salesAgent}
        value={agent}
        onChange={(e) => onAgentChange(e.target.value)}
      >
        <option value="">{f.allAgents}</option>
        {agentOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
      {showMinDays ? (
        <Select
          label={f.minDays}
          value={minDays}
          onChange={(e) => onMinDaysChange(e.target.value)}
        >
          <option value="0">{f.anyAge}</option>
          <option value="7">{f.days7}</option>
          <option value="14">{f.days14}</option>
          <option value="30">{f.days30}</option>
        </Select>
      ) : null}
      <div className="flex items-end">
        <Button
          variant="secondary"
          disabled={!hasFilter}
          onClick={() => {
            clearQuery();
            onClear();
          }}
        >
          {f.clearFilters}
        </Button>
      </div>
    </div>
  );
}

export function filterDebtLines(
  lines: DebtInvoiceLine[],
  agent: string,
  searchQuery: string,
  minDays: number
): DebtInvoiceLine[] {
  return lines.filter((row) => {
    if (agent && row.salesAgentName !== agent) return false;
    if (!debtInvoiceMatchesSearch(row, searchQuery)) return false;
    if (minDays > 0 && row.daysOutstanding < minDays) return false;
    return true;
  });
}
