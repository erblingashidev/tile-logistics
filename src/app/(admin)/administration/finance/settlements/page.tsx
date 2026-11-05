"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrgPath } from "@/components/organization/OrgPathProvider";

/** Legacy URL — payment status editing lives on the assignment queue only. */
export default function FinanceInvoiceSettlementsRedirectPage() {
  const router = useRouter();
  const { orgPath } = useOrgPath();

  useEffect(() => {
    router.replace(orgPath("/administration/finance/assignments"));
  }, [router, orgPath]);

  return null;
}
