"use client";

import { createContext, useContext } from "react";
import type { EmployeeRole } from "@/lib/constants";

export type AdminShellMode = "admin" | "cashier";

export type AdminShellSession = {
  role: "admin" | "employee";
  shellMode: AdminShellMode;
  roles: EmployeeRole[];
  name: string;
  isPlatformAdmin: boolean;
  organizationId: number | null;
  organizationName: string | null;
};

const AdminSessionContext = createContext<AdminShellSession | null>(null);

export function AdminSessionProvider({
  session,
  children,
}: {
  session: AdminShellSession;
  children: React.ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={session}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminShellSession | null {
  return useContext(AdminSessionContext);
}
