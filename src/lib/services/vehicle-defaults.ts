import { getEmployee, listEmployeesByRole } from "@/lib/services/employees";
import { assignEmployeeToOrder } from "@/lib/services/employees";

/** Unloaders whose notes reference this picker (seed / team setup). */
export async function findPickerTeamHelperIds(
  pickerEmployeeId: number
): Promise<number[]> {
  const picker = await getEmployee(pickerEmployeeId);
  if (!picker) return [];
  const firstName = picker.name.split(/\s+/)[0]?.toLowerCase() ?? "";
  const fullLower = picker.name.toLowerCase();

  const unloaders = await listEmployeesByRole("unloader");
  return unloaders
    .filter((e) => {
      const notes = (e.notes ?? "").toLowerCase();
      return (
        notes.includes("assists") &&
        (notes.includes(firstName) ||
          notes.includes(fullLower) ||
          notes.includes(picker.name.split(/\s+/)[0] ?? ""))
      );
    })
    .slice(0, 2)
    .map((e) => e.id);
}

export async function autoAssignPickerTeam(
  orderId: number,
  pickerEmployeeId: number
) {
  await assignEmployeeToOrder(orderId, pickerEmployeeId, "picker");
  for (const helperId of await findPickerTeamHelperIds(pickerEmployeeId)) {
    await assignEmployeeToOrder(orderId, helperId, "unloader");
  }
}
