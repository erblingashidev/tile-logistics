"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrgPath } from "@/components/organization/OrgPathProvider";

/** Legacy URL — client debts live under Finance → By client. */
export default function AdministrationClientsRedirectPage() {
  const router = useRouter();
  const { orgPath } = useOrgPath();

  useEffect(() => {
    router.replace(orgPath("/administration/finance/debts/by-client"));
  }, [router, orgPath]);

  return null;
}
