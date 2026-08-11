import type { ManualOrderStatus } from "@/lib/constants";

/** Map DB order state to manual status dropdown value. */
export function manualStatusFromOrder(input: {
  status: string;
  prepStatus?: "pending" | "prepared";
}): ManualOrderStatus {
  if (input.status === "assigned" && input.prepStatus === "prepared") {
    return "prepared";
  }
  return input.status as ManualOrderStatus;
}
