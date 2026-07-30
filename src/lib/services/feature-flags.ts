import { getAppSetting, setAppSetting } from "@/lib/services/app-settings";

export const MANUAL_DISPATCH_MODE_KEY = "manual_dispatch_mode";

/** When true, employee portal proofs / picker workflow is disabled; admin works manually. */
export async function isManualDispatchMode(): Promise<boolean> {
  const v = await getAppSetting(MANUAL_DISPATCH_MODE_KEY);
  if (v === "false") return false;
  if (v === "true") return true;
  // Default ON — invoice-driven ops until employee workflow is re-enabled.
  return true;
}

export async function setManualDispatchMode(enabled: boolean): Promise<void> {
  await setAppSetting(MANUAL_DISPATCH_MODE_KEY, enabled ? "true" : "false");
}

export async function assertEmployeeWorkflowEnabled(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (await isManualDispatchMode()) {
    return {
      ok: false,
      error:
        "Employee delivery workflow is paused. Use admin orders to update status manually.",
    };
  }
  return { ok: true };
}
