"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/warehouse", label: "Warehouse" },
  { href: "/routes", label: "Routes" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/employees", label: "Employees" },
  { href: "/logs", label: "Logs" },
  { href: "/reports", label: "Reports" },
];

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          const from = encodeURIComponent(pathname || "/");
          router.replace(`/login?from=${from}`);
          return null;
        }
        return r.json();
      })
      .then((data) => setUserName(data?.user?.name ?? null))
      .catch(() => {
        router.replace("/login");
      });
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-52 shrink-0 flex-col bg-[var(--sidebar)] lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[15px] font-semibold tracking-tight text-white">
              {BRAND.name}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{BRAND.tagline}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-3">
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-3 py-2 text-sm transition ${
                    active
                      ? "bg-white/10 font-medium text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3">
            {userName && (
              <p className="mb-2 truncate px-3 text-xs text-zinc-400">
                {userName}
              </p>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
              <div className="lg:hidden">
                <p className="text-sm font-semibold text-zinc-900">
                  {BRAND.name}
                </p>
              </div>
              {title && (
                <h1 className="hidden text-lg font-semibold text-zinc-900 lg:block">
                  {title}
                </h1>
              )}
              <div className="flex items-center gap-2">
                {userName && (
                  <span className="hidden text-xs text-zinc-500 lg:inline">
                    {userName}
                  </span>
                )}
                <Button
                  variant="ghost"
                  className="text-xs lg:hidden"
                  onClick={logout}
                >
                  Log out
                </Button>
                <nav className="flex gap-1 overflow-x-auto lg:hidden">
                  {nav.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`whitespace-nowrap px-2.5 py-1 text-xs ${
                          active
                            ? "font-medium text-zinc-900 underline underline-offset-4"
                            : "text-zinc-500"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
            {title && (
              <div className="border-t border-zinc-100 px-4 py-3 lg:hidden">
                <h1 className="text-base font-semibold text-zinc-900">
                  {title}
                </h1>
              </div>
            )}
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
