"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  async function openLogin() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Still send them to login even if logout fails.
    }
    window.location.replace("/login");
  }

  const needsCompany =
    error.message.includes("Select a company") ||
    error.name === "TenantRequiredError";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-white">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-zinc-400">
        {needsCompany
          ? "Choose a company first, or sign out and log in again."
          : "The page hit an unexpected error. Sign out and open login — that clears the stuck session on this browser."}
      </p>
      {error.message ? (
        <p className="max-w-md text-center text-xs text-zinc-500">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void openLogin()}
          className="rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Sign out and open login
        </button>
        {needsCompany ? (
          <a
            href="/platform/companies"
            className="rounded border border-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
          >
            Choose company
          </a>
        ) : (
          <button
            type="button"
            onClick={() => reset()}
            className="rounded border border-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
