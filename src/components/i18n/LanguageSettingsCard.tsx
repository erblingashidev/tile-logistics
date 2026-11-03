"use client";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Card } from "@/components/ui";

export function LanguageSettingsCard() {
  const t = useAppMessages();

  return (
    <Card className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {t.lang.label}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900">
        {t.settings.languageSection}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">{t.settings.languageHint}</p>
      <div className="mt-4">
        <LanguageSwitcher />
      </div>
    </Card>
  );
}
