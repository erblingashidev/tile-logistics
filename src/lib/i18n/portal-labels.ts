"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { localizePortalError } from "@/lib/i18n/sq";

export function usePortalLabels() {
  const { locale, messages } = useLocale();
  const p = messages.portal;
  return {
    p,
    statusLabel: (status: string) =>
      p.status[status] ?? status.replace(/_/g, " "),
    orderStatusLabel: (status: string) =>
      p.orderStatus[status] ?? status.replace(/_/g, " "),
    proofLabel: (phase: string) => p.proof[phase] ?? phase,
    localizeError: (message: string | null | undefined) => {
      if (locale === "sq") return localizePortalError(message);
      if (!message?.trim()) return p.errors.generic;
      return message.trim();
    },
  };
}
