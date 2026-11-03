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
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Input } from "@/components/ui";

type FinanceSearchContextValue = {
  query: string;
  setQuery: (next: string) => void;
  clearQuery: () => void;
};

const FinanceSearchContext = createContext<FinanceSearchContextValue | null>(
  null
);

export function useFinanceSearch() {
  const ctx = useContext(FinanceSearchContext);
  if (!ctx) {
    throw new Error("useFinanceSearch must be used within FinanceSearchProvider");
  }
  return ctx;
}

export function FinanceSearchProvider({ children }: { children: ReactNode }) {
  const t = useAppMessages();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [draft, setDraft] = useState(urlQuery);

  useEffect(() => {
    setDraft(urlQuery);
  }, [urlQuery]);

  const commitQuery = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setQuery = useCallback(
    (next: string) => {
      setDraft(next);
      commitQuery(next);
    },
    [commitQuery]
  );

  const clearQuery = useCallback(() => {
    setDraft("");
    commitQuery("");
  }, [commitQuery]);

  const value = useMemo(
    () => ({
      query: urlQuery,
      setQuery,
      clearQuery,
    }),
    [urlQuery, setQuery, clearQuery]
  );

  return (
    <FinanceSearchContext.Provider value={value}>
      <div className="mb-5 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/80 p-4 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t.finance.search.label}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="min-w-[min(100%,20rem)] flex-1">
            <Input
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
                if (draft.trim() !== urlQuery.trim()) commitQuery(draft);
              }}
            />
          </div>
          {draft.trim() || urlQuery.trim() ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              onClick={() => {
                clearQuery();
                setDraft("");
              }}
            >
              {t.common.clear}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{t.finance.search.hint}</p>
      </div>
      {children}
    </FinanceSearchContext.Provider>
  );
}
