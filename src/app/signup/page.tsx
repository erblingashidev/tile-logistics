"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { COMPANY_CATEGORIES, slugifyCompanyName } from "@/lib/company-profile";

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [companyCategory, setCompanyCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const suggestedSlug = useMemo(
    () => slugifyCompanyName(orgName),
    [orgName]
  );

  function onOrgNameChange(value: string) {
    setOrgName(value);
    if (!slugTouched) setSlug(slugifyCompanyName(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName,
          slug: slug || suggestedSlug,
          contactName,
          contactEmail,
          adminUsername,
          adminPassword,
          companyCategory,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not submit application.");
        return;
      }
      setSuccess(data.message ?? "Application submitted.");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10">
      <Card className="w-full max-w-lg p-6">
        <p className="text-lg font-semibold text-zinc-900">{BRAND.name}</p>
        <p className="mt-1 text-sm text-zinc-500">
          For new companies only. Access is granted after platform approval.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Already have an AGIMI account?{" "}
          <Link href="/login" className="font-medium underline">
            Log in here
          </Link>{" "}
          — your orders and data are not affected.
        </p>

        {success ? (
          <div className="mt-6 space-y-4">
            <Alert tone="info">{success}</Alert>
            <Link
              href="/login"
              className="inline-block text-sm font-medium text-zinc-900 underline"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Company name"
              value={orgName}
              onChange={(e) => onOrgNameChange(e.target.value)}
              required
            />
            <Input
              label="Company URL slug"
              hint="Used internally to identify your company"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Company type
              </label>
              <select
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                value={companyCategory}
                onChange={(e) => setCompanyCategory(e.target.value)}
              >
                {COMPANY_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                {
                  COMPANY_CATEGORIES.find((c) => c.id === companyCategory)
                    ?.description
                }
              </p>
            </div>
            <Input
              label="Your name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
            />
            <Input
              label="Admin username"
              autoComplete="username"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              required
            />
            <Input
              label="Admin password"
              type="password"
              autoComplete="new-password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Note (optional)
              </label>
              <textarea
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your business or setup needs"
              />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting…" : "Submit application"}
            </Button>
            <p className="text-center text-sm text-zinc-500">
              Already have access?{" "}
              <Link href="/login" className="font-medium text-zinc-900 underline">
                Log in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
