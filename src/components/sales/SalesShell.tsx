"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";

type SalesNav = "orders" | "stock";

export function SalesShell({
  userName,
  isAdmin,
  onLogout,
  children,
}: {
  userName?: string | null;
  isAdmin?: boolean;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeNav: SalesNav = pathname.startsWith("/sales/stock")
    ? "stock"
    : "orders";

  const title =
    activeNav === "stock"
      ? isAdmin
        ? "Warehouse stock"
        : "Stock levels"
      : isAdmin
        ? "All orders"
        : "My orders";

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-100 via-slate-50 to-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">
                {title}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {userName ?? BRAND.shortName}
                {isAdmin ? " · Sales admin" : " · Sales agent"}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-3xl space-y-4 px-4 py-5 pb-24">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200/80 bg-white/95 px-3 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl gap-1">
          <Link
            href="/sales"
            className={`flex-1 rounded-xl px-2 py-2.5 text-center text-xs font-semibold transition ${
              activeNav === "orders"
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Orders
          </Link>
          <Link
            href="/sales/stock"
            className={`flex-1 rounded-xl px-2 py-2.5 text-center text-xs font-semibold transition ${
              activeNav === "stock"
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Stock
          </Link>
        </div>
      </nav>
    </div>
  );
}
