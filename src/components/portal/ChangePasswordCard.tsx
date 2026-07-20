"use client";

import { useState } from "react";
import { PortalCard, PortalSectionTitle } from "@/components/portal/PortalShell";
import { Alert, Button, Card, Input } from "@/components/ui";

type ChangePasswordLabels = {
  title: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  save: string;
  success: string;
  toggleShow: string;
  toggleHide: string;
};

const defaultLabels: ChangePasswordLabels = {
  title: "Change password",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  save: "Update password",
  success: "Password updated",
  toggleShow: "Show",
  toggleHide: "Hide",
};

function PasswordSurface({
  variant,
  children,
  className = "",
}: {
  variant: "portal" | "admin";
  children: React.ReactNode;
  className?: string;
}) {
  if (variant === "admin") {
    return <Card className={`p-5 ${className}`}>{children}</Card>;
  }
  return <PortalCard className={className}>{children}</PortalCard>;
}

function PasswordTitle({
  variant,
  children,
  className = "",
}: {
  variant: "portal" | "admin";
  children: React.ReactNode;
  className?: string;
}) {
  if (variant === "admin") {
    return (
      <h2 className={`text-sm font-semibold text-zinc-900 ${className}`}>
        {children}
      </h2>
    );
  }
  return (
    <PortalSectionTitle
      className={`normal-case tracking-normal text-zinc-700 ${className}`}
    >
      {children}
    </PortalSectionTitle>
  );
}

export function ChangePasswordCard({
  labels = defaultLabels,
  variant = "portal",
  defaultOpen = false,
}: {
  labels?: Partial<ChangePasswordLabels>;
  variant?: "portal" | "admin";
  defaultOpen?: boolean;
}) {
  const copy = { ...defaultLabels, ...labels };
  const alwaysOpen = defaultOpen || variant === "admin";
  const [open, setOpen] = useState(alwaysOpen);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not update password");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(copy.success);
    setTimeout(() => setSuccess(""), 3000);
  }

  return (
    <PasswordSurface variant={variant}>
      {alwaysOpen ? (
        <PasswordTitle variant={variant} className="mb-4">
          {copy.title}
        </PasswordTitle>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <PasswordTitle variant={variant}>{copy.title}</PasswordTitle>
          <span className="text-xs font-medium text-zinc-500">
            {open ? "−" : "+"}
          </span>
        </button>
      )}

      {(open || alwaysOpen) && (
        <form
          onSubmit={submit}
          className={`space-y-3 ${!alwaysOpen ? "mt-4" : ""}`}
          autoComplete="off"
        >
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="info">{success}</Alert>}

          <Input
            label={copy.currentPassword}
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            name="employee-current-password"
            required
          />
          <Input
            label={copy.newPassword}
            type={showPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            name="employee-new-password"
            required
          />
          <Input
            label={copy.confirmPassword}
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            name="employee-confirm-password"
            required
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy}>
              {copy.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPasswords((value) => !value)}
            >
              {showPasswords ? copy.toggleHide : copy.toggleShow}
            </Button>
          </div>
        </form>
      )}
    </PasswordSurface>
  );
}
