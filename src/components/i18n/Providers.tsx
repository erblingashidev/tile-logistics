"use client";

import { LocaleProvider } from "@/components/i18n/LocaleProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
