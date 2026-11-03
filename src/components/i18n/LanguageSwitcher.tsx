"use client";

import { useAppMessages, useLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale } = useLocale();
  const t = useAppMessages();

  function select(next: Locale) {
    if (next !== locale) setLocale(next);
  }

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      role="group"
      aria-label={t.lang.label}
    >
      {!compact ? (
        <span className="mr-1 text-xs text-zinc-500">{t.lang.label}</span>
      ) : null}
      {(["en", "sq"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => select(code)}
          className={`rounded px-2 py-1 text-xs font-medium transition ${
            locale === code
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          {code === "en" ? t.lang.en : t.lang.sq}
        </button>
      ))}
    </div>
  );
}
