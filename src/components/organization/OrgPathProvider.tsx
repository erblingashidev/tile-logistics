"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { tenantPath } from "@/lib/organizations/paths";

type OrgPathContextValue = {
  organizationSlug: string | null;
  orgPath: (internalPath: string) => string;
};

const OrgPathContext = createContext<OrgPathContextValue>({
  organizationSlug: null,
  orgPath: (path) => path,
});

export function OrgPathProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string | null;
  children: ReactNode;
}) {
  const orgPath = useCallback(
    (internalPath: string) => {
      if (!organizationSlug) return internalPath;
      if (internalPath.startsWith("/platform")) return internalPath;
      return tenantPath(organizationSlug, internalPath);
    },
    [organizationSlug]
  );

  const value = useMemo(
    () => ({ organizationSlug, orgPath }),
    [organizationSlug, orgPath]
  );

  return (
    <OrgPathContext.Provider value={value}>{children}</OrgPathContext.Provider>
  );
}

export function useOrgPath() {
  return useContext(OrgPathContext);
}
