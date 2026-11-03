"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { usePortalLabels } from "@/lib/i18n/portal-labels";

export default function PortalNoAccessPage() {
  const { p } = usePortalLabels();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <Card className="max-w-md p-6 text-center">
        <p className="text-lg font-semibold text-zinc-900">
          {p.noPortalAccessTitle}
        </p>
        <p className="mt-2 text-sm text-zinc-600">{p.noPortalAccessBody}</p>
        <Button className="mt-6 w-full" onClick={logout}>
          {p.logout}
        </Button>
        <Link
          href="/login"
          className="mt-3 block text-xs text-zinc-500 underline"
        >
          Login
        </Link>
      </Card>
    </div>
  );
}
