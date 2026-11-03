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

/** Context only — render {@link FinanceSearchBar} inside the page shell. */
export function FinanceSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

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
      commitQuery(next);
    },
    [commitQuery]
  );

  const clearQuery = useCallback(() => {
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
      {children}
    </FinanceSearchContext.Provider>
  );
}

export function FinanceSearchBar() {
  const t = useAppMessages();
  const { query, clearQuery } = useFinanceSearch();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  function commitQuery(next: string) {
    const trimmed = next.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90 p-5 shadow-md">
        <label className="block text-sm font-semibold uppercase tracking-wide text-zinc-600">
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
              if (draft.trim() !== query.trim()) commitQuery(draft);
            }}
          />
        </div>
        {draft.trim() || query.trim() ? (
          <button
            type="button"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            onClick={() => {
              clearQuery();
              setDraft("");
            }}
          >
            {t.common.clear}
          </button>
        ) : null}
      </div>
        <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">{t.finance.search.hint}</p>
    </div>
  );
}
