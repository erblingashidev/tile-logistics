"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { sq } from "@/lib/i18n/sq";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";

type PortalNav = "orders" | "wms" | "reports";

interface PortalShellProps {
  title: string;
  subtitle?: string;
  activeNav?: PortalNav;
  showOrders?: boolean;
  showWms?: boolean;
  showReports?: boolean;
  showChangePassword?: boolean;
  onLogout: () => void;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  children: React.ReactNode;
}

function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function navClass(active: boolean) {
  return active
    ? "bg-zinc-900 text-white shadow-sm"
    : "text-zinc-600 hover:bg-white/80 hover:text-zinc-900";
}

export function PortalShell({
  title,
  subtitle,
  activeNav,
  showOrders = true,
  showWms = false,
  showReports = false,
  showChangePassword = true,
  onLogout,
  onRefresh,
  refreshing = false,
  children,
}: PortalShellProps) {
  const navItems = [
    showOrders && { id: "orders" as const, href: "/portal", label: sq.ordersLink },
    showWms && { id: "wms" as const, href: "/portal/wms", label: sq.depotLink },
    showReports && {
      id: "reports" as const,
      href: "/portal/reports",
      label: sq.reportsLink,
    },
  ].filter(Boolean) as Array<{ id: PortalNav; href: string; label: string }>;

  return (
    <div className="portal-shell min-h-screen bg-gradient-to-b from-zinc-100 via-slate-50 to-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-bold text-white shadow-sm">
                {initials(subtitle)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {title}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {subtitle ?? BRAND.shortName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {sq.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-lg space-y-4 px-4 py-5 pb-24">
        {children}
        {showChangePassword && (
          <ChangePasswordCard
            labels={{
              title: sq.changePasswordTitle,
              currentPassword: sq.currentPassword,
              newPassword: sq.newPassword,
              confirmPassword: sq.confirmPassword,
              save: sq.updatePassword,
              success: sq.passwordUpdated,
              toggleShow: sq.showPassword,
              toggleHide: sq.hidePassword,
            }}
          />
        )}
      </main>

      {(navItems.length > 1 || onRefresh) && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200/80 bg-white/95 px-3 py-2 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center gap-1">
            {navItems.length > 0 && (
              <div className="flex min-w-0 flex-1 gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`min-w-0 flex-1 rounded-xl px-2 py-2.5 text-center text-xs font-semibold transition ${navClass(
                      activeNav === item.id
                    )}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={refreshing}
                aria-label={sq.refresh}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 md:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                {sq.refresh}
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

export function PortalTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-zinc-900/[0.06] p-1 ring-1 ring-zinc-200/80">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-xl px-2 py-3 text-sm font-semibold transition disabled:opacity-40 ${
            value === tab.id
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PortalCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function PortalSectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-xs font-semibold uppercase tracking-wide text-zinc-500 ${className}`}
    >
      {children}
    </h2>
  );
}

export function PortalChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}
