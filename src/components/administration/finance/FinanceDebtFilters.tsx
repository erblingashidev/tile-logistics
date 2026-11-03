"use client";

import { Button, Input, Select } from "@/components/ui";

export function FinanceDebtFilters({
  agent,
  onAgentChange,
  agentOptions,
  clientSearch,
  onClientSearchChange,
  minDays,
  onMinDaysChange,
  showMinDays = true,
  onClear,
}: {
  agent: string;
  onAgentChange: (v: string) => void;
  agentOptions: string[];
  clientSearch: string;
  onClientSearchChange: (v: string) => void;
  minDays: string;
  onMinDaysChange: (v: string) => void;
  showMinDays?: boolean;
  onClear: () => void;
}) {
  const hasFilter =
    Boolean(agent) || Boolean(clientSearch.trim()) || (showMinDays && minDays !== "0");

  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label="Sales agent"
        value={agent}
        onChange={(e) => onAgentChange(e.target.value)}
      >
        <option value="">All agents</option>
        {agentOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
      <Input
        label="Client search"
        placeholder="Customer name…"
        value={clientSearch}
        onChange={(e) => onClientSearchChange(e.target.value)}
      />
      {showMinDays ? (
        <Select
          label="Minimum days outstanding"
          value={minDays}
          onChange={(e) => onMinDaysChange(e.target.value)}
        >
          <option value="0">Any age</option>
          <option value="7">7+ days</option>
          <option value="14">14+ days</option>
          <option value="30">30+ days</option>
        </Select>
      ) : null}
      <div className="flex items-end">
        <Button variant="secondary" disabled={!hasFilter} onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

export function filterDebtLines<
  T extends {
    salesAgentName: string;
    displayName: string;
    daysOutstanding: number;
  },
>(
  lines: T[],
  agent: string,
  clientSearch: string,
  minDays: number
): T[] {
  const q = clientSearch.trim().toLowerCase();
  return lines.filter((row) => {
    if (agent && row.salesAgentName !== agent) return false;
    if (q && !row.displayName.toLowerCase().includes(q)) return false;
    if (minDays > 0 && row.daysOutstanding < minDays) return false;
    return true;
  });
}
