import type { Locale } from "@/lib/i18n/config";
import { en, type AppMessages } from "@/lib/i18n/messages/en";
import { sqApp } from "@/lib/i18n/messages/sq-app";
import { sq } from "@/lib/i18n/sq";
import { enPortal } from "@/lib/i18n/en-portal";

export type { AppMessages };

/** Portal copy allows any locale string while keeping sq’s shape. */
type WidenStrings<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => WidenStrings<R>
    : T extends object
      ? { [K in keyof T]: WidenStrings<T[K]> }
      : T;

export type PortalMessages = WidenStrings<typeof sq>;

export type Messages = {
  app: AppMessages;
  portal: PortalMessages;
};

export function getMessages(locale: Locale): Messages {
  if (locale === "sq") {
    return { app: sqApp, portal: sq as PortalMessages };
  }
  return { app: en, portal: enPortal };
}
