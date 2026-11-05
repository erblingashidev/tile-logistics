import { NextResponse } from "next/server";
import { assertCashRegisterEnabled } from "@/lib/services/administration-settings";

/** Block register ledger APIs when the org has cash register turned off. */
export async function guardCashRegisterEnabled(organizationId: number) {
  try {
    await assertCashRegisterEnabled(organizationId);
    return null;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cash register is disabled.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
