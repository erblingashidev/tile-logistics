"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { todayBusinessDay } from "@/lib/administration/prodata-invoice-conflicts";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Input } from "@/components/ui";

type FinanceSearchContextValue = {
  query: string;
  setQuery: (next: string) => void;
  clearQuery: () => void;
};

type FinanceDayContextValue = {
  businessDay: string;
  setBusinessDay: (day: string) => void;
};

const FinanceSearchContext = createContext<FinanceSearchContextValue | null>(
  null
);
const FinanceDayContext = createContext<FinanceDayContextValue | null>(null);

export function useFinanceSearch() {
  const ctx = useContext(FinanceSearchContext);
  if (!ctx) {
    throw new Error("useFinanceSearch must be used within FinanceSearchProvider");
  }
  return ctx;
}

export function useFinanceBusinessDay() {
  const ctx = useContext(FinanceDayContext);
  if (!ctx) {
    throw new Error(
      "useFinanceBusinessDay must be used within FinanceSearchProvider"
    );
  }
  return ctx;
}

function useFinanceUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { replaceParams, searchParams };
}

/** Context for finance search + business day (`day` URL param, default today). */
export function FinanceSearchProvider({ children }: { children: ReactNode }) {
  const { replaceParams, searchParams } = useFinanceUrlParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlDay = searchParams.get("day") ?? todayBusinessDay();

  useEffect(() => {
    if (!searchParams.get("day")) {
      replaceParams((params) => {
        params.set("day", todayBusinessDay());
      });
    }
  }, [replaceParams, searchParams]);

  const setQuery = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      replaceParams((params) => {
        if (trimmed) params.set("q", trimmed);
        else params.delete("q");
      });
    },
    [replaceParams]
  );

  const clearQuery = useCallback(() => {
    replaceParams((params) => {
      params.delete("q");
    });
  }, [replaceParams]);

  const setBusinessDay = useCallback(
    (day: string) => {
      const d = day.trim().slice(0, 10);
      if (!d) return;
      replaceParams((params) => {
        params.set("day", d);
      });
    },
    [replaceParams]
  );

  const searchValue = useMemo(
    () => ({
      query: urlQuery,
      setQuery,
      clearQuery,
    }),
    [urlQuery, setQuery, clearQuery]
  );

  const dayValue = useMemo(
    () => ({
      businessDay: urlDay,
      setBusinessDay,
    }),
    [urlDay, setBusinessDay]
  );

  return (
    <FinanceSearchContext.Provider value={searchValue}>
      <FinanceDayContext.Provider value={dayValue}>
        {children}
      </FinanceDayContext.Provider>
    </FinanceSearchContext.Provider>
  );
}

export function FinanceSearchBar() {
  const t = useAppMessages();
  const pathname = usePathname();
  const { query, clearQuery } = useFinanceSearch();
  const { businessDay, setBusinessDay } = useFinanceBusinessDay();
  const { replaceParams } = useFinanceUrlParams();
  const [draft, setDraft] = useState(query);
  const [dayDraft, setDayDraft] = useState(businessDay);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    setDayDraft(businessDay);
  }, [businessDay]);

  function commitQuery(next: string) {
    const trimmed = next.trim();
    replaceParams((params) => {
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
    });
  }

  const onDebtsRoute = pathname.includes("/administration/finance/debts");

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
      {onDebtsRoute && t.finance.workday.scopeNote ? (
        <p className="mb-3 text-xs text-zinc-500">{t.finance.workday.scopeNote}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="text-xs font-medium text-zinc-600">
          {t.finance.workday.label}
        </label>
        <Input
          type="date"
          className="mt-1 w-40"
          value={dayDraft}
          onChange={(e) => {
            setDayDraft(e.target.value);
            setBusinessDay(e.target.value);
          }}
        />
      </div>
      <div className="min-w-[min(100%,16rem)] flex-1">
        <label className="text-xs font-medium text-zinc-600">
          {t.finance.search.label}
        </label>
        <Input
          className="mt-1"
          aria-label={t.finance.search.label}
          placeholder={t.finance.search.placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitQuery(draft);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              clearQuery();
              setDraft("");
            }
          }}
          onBlur={() => {
            if (draft.trim() !== query.trim()) commitQuery(draft);
          }}
        />
      </div>
      </div>
    </div>
  );
}
