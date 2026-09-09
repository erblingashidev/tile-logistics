"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_COMPANY_MODULES,
  type CompanyModuleFlags,
  type CompanyProfile,
  type OrganizationUnit,
} from "@/lib/company-profile";

type CompanyContextValue = {
  profile: CompanyProfile | null;
  units: OrganizationUnit[];
  loading: boolean;
};

const defaultProfile: CompanyProfile = {
  companyCategory: "general",
  productFocus: "general",
  modules: { ...DEFAULT_COMPANY_MODULES },
  onboardingComplete: true,
};

const CompanyProfileContext = createContext<CompanyContextValue>({
  profile: defaultProfile,
  units: [],
  loading: true,
});

export function CompanyProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(defaultProfile);
  const [units, setUnits] = useState<OrganizationUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/company/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProfile(data.profile ?? defaultProfile);
        setUnits(data.units ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ profile, units, loading }),
    [profile, units, loading]
  );

  return (
    <CompanyProfileContext.Provider value={value}>
      {children}
    </CompanyProfileContext.Provider>
  );
}

export function useCompanyProfile(): CompanyContextValue {
  return useContext(CompanyProfileContext);
}

export function useCompanyModules(): CompanyModuleFlags {
  const { profile } = useCompanyProfile();
  return profile?.modules ?? DEFAULT_COMPANY_MODULES;
}
