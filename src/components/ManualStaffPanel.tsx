"use client";

import { useEffect, useState } from "react";
import { Button, Select } from "@/components/ui";

interface StaffMember {
  role?: string;
  employeeId?: number;
  employeeName: string;
  assignedAt?: string;
}

interface ManualStaffPanelProps {
  orderId: number;
  staff?: {
    picker?: StaffMember | null;
    driver?: StaffMember | null;
    groupLeader?: StaffMember | null;
    staff?: StaffMember[];
  };
  onSaved: () => void;
  onError: (message: string) => void;
}

const ASSIGN_ROLES = [
  { role: "group_leader" as const, label: "Group leader" },
  { role: "picker" as const, label: "Picker" },
  { role: "driver" as const, label: "Driver" },
];

type AssignRole = (typeof ASSIGN_ROLES)[number]["role"];

export function ManualStaffPanel({
  orderId,
  staff,
  onSaved,
  onError,
}: ManualStaffPanelProps) {
  const [employees, setEmployees] = useState<
    Array<{ id: number; name: string; roles: string[] }>
  >([]);
  const [draft, setDraft] = useState({
    group_leader: "",
    picker: "",
    driver: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      group_leader: staff?.groupLeader?.employeeId
        ? String(staff.groupLeader.employeeId)
        : staff?.staff?.find((s) => s.role === "group_leader")?.employeeId
          ? String(
              staff.staff.find((s) => s.role === "group_leader")!.employeeId
            )
          : "",
      picker: staff?.picker?.employeeId ? String(staff.picker.employeeId) : "",
      driver: staff?.driver?.employeeId ? String(staff.driver.employeeId) : "",
    }));
  }, [staff]);

  async function saveRole(role: AssignRole) {
    setBusy(true);
    onError("");
    const employeeId = draft[role];
    if (!employeeId) {
      const res = await fetch(
        `/api/orders/${orderId}/staff?role=${encodeURIComponent(role)}`,
        { method: "DELETE" }
      );
      setBusy(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Could not clear assignment");
        return;
      }
      onSaved();
      return;
    }

    const res = await fetch(`/api/orders/${orderId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: Number(employeeId), role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      onError(data.error ?? "Could not assign staff");
      return;
    }
    onSaved();
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Assign staff (manual tracking)
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {ASSIGN_ROLES.map(({ role, label }) => {
          const options = employees.filter((e) => e.roles.includes(role));
          const current =
            role === "group_leader"
              ? staff?.groupLeader
              : role === "picker"
                ? staff?.picker
                : staff?.driver;
          return (
            <div key={role} className="space-y-2">
              <Select
                label={label}
                value={draft[role]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [role]: e.target.value }))
                }
              >
                <option value="">— Not assigned —</option>
                {options.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
              {current?.employeeName && !current?.assignedAt && (
                <p className="text-[10px] text-zinc-500">No step time recorded</p>
              )}
              {current?.assignedAt && (
                <p className="text-[10px] text-zinc-500">
                  Since {current.assignedAt.slice(0, 16).replace("T", " ")}
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                className="w-full text-xs"
                disabled={busy}
                onClick={() => void saveRole(role)}
              >
                Save {label.toLowerCase()}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
