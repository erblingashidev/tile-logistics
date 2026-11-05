"use client";

import { usePathname } from "next/navigation";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

function activeStep(pathname: string): number {
  if (pathname.includes("/finance/imports")) return 1;
  if (pathname.includes("/finance/assignments")) return 2;
  if (pathname.includes("/finance/debts")) return 3;
  if (pathname.includes("/finance/debts/by-client")) return 4;
  return 0;
}

export function FinanceProcessSteps() {
  const pathname = usePathname();
  const t = useAppMessages();
  const steps = t.finance.workflow.steps;
  const current = activeStep(pathname);

  return (
    <ol className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <li
            key={label}
            className={`rounded-lg border px-3 py-2 text-sm ${
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            <span className="mr-2 font-bold">{n}.</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
