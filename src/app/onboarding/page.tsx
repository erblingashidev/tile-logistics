"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  LoadingState,
  Switch,
} from "@/components/ui";
import { BRAND } from "@/lib/brand";
import type {
  CompanyCategory,
  CompanyModuleFlags,
  OrganizationUnit,
  ProductFocus,
} from "@/lib/company-profile";

type OnboardingData = {
  organizationName?: string;
  isLegacyAgimi?: boolean;
  profile: {
    companyCategory: CompanyCategory;
    productFocus: ProductFocus;
    modules: CompanyModuleFlags;
  };
  units: OrganizationUnit[];
  categories: Array<{ id: CompanyCategory; label: string; description: string }>;
  productFocusOptions: Array<{ id: ProductFocus; label: string }>;
  presets: Record<
    CompanyCategory,
    {
      productFocus?: ProductFocus;
      modules?: Partial<CompanyModuleFlags>;
      suggestedUnits?: OrganizationUnit[];
    }
  >;
};

const STEPS = ["Company", "Location", "Units", "Modules", "Finish"] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<OnboardingData | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [warehouseName, setWarehouseName] = useState("Main warehouse");
  const [warehouseAddress, setWarehouseAddress] = useState("");
  const [warehouseCity, setWarehouseCity] = useState("");
  const [companyCategory, setCompanyCategory] =
    useState<CompanyCategory>("general");
  const [productFocus, setProductFocus] = useState<ProductFocus>("general");
  const [units, setUnits] = useState<OrganizationUnit[]>([]);
  const [modules, setModules] = useState<CompanyModuleFlags>({
    vehicles: false,
    dispatch: false,
    warehouse: false,
    returns: true,
    employeePortal: false,
    useInvoices: true,
  });

  useEffect(() => {
    fetch("/api/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((payload: OnboardingData) => {
        if (payload.isLegacyAgimi) {
          window.location.href = "/";
          return;
        }
        setData(payload);
        setCompanyName(payload.organizationName ?? "");
        setCompanyCategory(payload.profile.companyCategory);
        setProductFocus(payload.profile.productFocus);
        setModules(payload.profile.modules);
        setUnits(
          payload.units.length
            ? payload.units
            : payload.presets[payload.profile.companyCategory]?.suggestedUnits ??
                [{ code: "piece", label: "pieces" }]
        );
      })
      .catch(() => setError("Could not load setup data."))
      .finally(() => setLoading(false));
  }, []);

  const preset = data?.presets[companyCategory];

  function applyCategoryPreset(category: CompanyCategory) {
    setCompanyCategory(category);
    const p = data?.presets[category];
    if (!p) return;
    if (p.productFocus) setProductFocus(p.productFocus);
    if (p.modules) {
      setModules((m) => ({ ...m, ...p.modules }));
    }
    if (p.suggestedUnits?.length) {
      setUnits(p.suggestedUnits.map((u) => ({ ...u })));
    }
  }

  function updateUnit(index: number, field: "code" | "label", value: string) {
    setUnits((prev) =>
      prev.map((u, i) => (i === index ? { ...u, [field]: value } : u))
    );
  }

  function addUnit() {
    setUnits((prev) => [...prev, { code: "", label: "", sortOrder: prev.length }]);
  }

  function removeUnit(index: number) {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  }

  const validUnits = useMemo(
    () => units.filter((u) => u.code.trim() && u.label.trim()),
    [units]
  );

  async function finishSetup() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyCategory,
          productFocus,
          modules,
          units: validUnits,
          warehouse: {
            name: warehouseName,
            address: warehouseAddress,
            city: warehouseCity,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not save setup.");
        return;
      }
      await fetch("/api/auth/refresh-session", { method: "POST" });
      window.location.href = "/";
    } catch {
      setError("Could not save setup.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <LoadingState title="Loading setup…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold text-zinc-900">{BRAND.name}</p>
          <p className="mt-1 text-sm text-zinc-500">
            Set up your company — step {step + 1} of {STEPS.length}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  i === step
                    ? "bg-zinc-900 text-white"
                    : i < step
                      ? "bg-zinc-300 text-zinc-700"
                      : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Your company
              </h2>
              <Input
                label="Company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
              <p className="text-sm font-medium text-zinc-700">Business type</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(data?.categories ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => applyCategoryPreset(c.id)}
                    className={`rounded-lg border p-4 text-left transition ${
                      companyCategory === c.id
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    <p className="font-medium text-zinc-900">{c.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">{c.description}</p>
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Product focus
                </label>
                <select
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  value={productFocus}
                  onChange={(e) => setProductFocus(e.target.value as ProductFocus)}
                >
                  {(data?.productFocusOptions ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Main warehouse / depot
              </h2>
              <p className="text-sm text-zinc-500">
                Used as the map pin and starting point for delivery routes.
              </p>
              <Input
                label="Warehouse name"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                required
              />
              <Input
                label="Address"
                value={warehouseAddress}
                onChange={(e) => setWarehouseAddress(e.target.value)}
                required
              />
              <Input
                label="City / area"
                value={warehouseCity}
                onChange={(e) => setWarehouseCity(e.target.value)}
                placeholder="e.g. Prishtinë"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Quantity units
              </h2>
              <p className="text-sm text-zinc-500">
                Add the units your team uses (e.g. m², bags, pieces). You can
                change these later.
              </p>
              {units.map((unit, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    label={index === 0 ? "Code" : undefined}
                    placeholder="m2"
                    value={unit.code}
                    onChange={(e) => updateUnit(index, "code", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    label={index === 0 ? "Label" : undefined}
                    placeholder="m²"
                    value={unit.label}
                    onChange={(e) => updateUnit(index, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-6 shrink-0"
                    onClick={() => removeUnit(index)}
                    disabled={units.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addUnit}>
                Add unit
              </Button>
              {validUnits.length === 0 && (
                <p className="text-sm text-amber-700">
                  Add at least one unit with code and label.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Which modules do you need?
              </h2>
              <Switch
                label="Vehicles & fleet"
                description="Track trucks and maintenance"
                checked={modules.vehicles}
                onCheckedChange={(v) => setModules((m) => ({ ...m, vehicles: v }))}
              />
              <Switch
                label="Dispatch & delivery"
                description="Assign orders to drivers and rounds"
                checked={modules.dispatch}
                onCheckedChange={(v) => setModules((m) => ({ ...m, dispatch: v }))}
              />
              <Switch
                label="Warehouse (WMS)"
                description="Stock, locations, and depot portal"
                checked={modules.warehouse}
                onCheckedChange={(v) => setModules((m) => ({ ...m, warehouse: v }))}
              />
              <Switch
                label="Customer returns"
                description="Record return evidence on orders"
                checked={modules.returns}
                onCheckedChange={(v) => setModules((m) => ({ ...m, returns: v }))}
              />
              <Switch
                label="Employee delivery portal"
                description="Drivers update order status from their phones"
                checked={modules.employeePortal}
                onCheckedChange={(v) =>
                  setModules((m) => ({ ...m, employeePortal: v }))
                }
              />
              <Switch
                label="Invoice numbers on orders"
                description="Scan or enter invoice numbers for orders"
                checked={modules.useInvoices}
                onCheckedChange={(v) => setModules((m) => ({ ...m, useInvoices: v }))}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Ready to go
              </h2>
              <p className="text-sm text-zinc-600">
                Review your setup. You can adjust modules and units in Settings
                later.
              </p>
              <dl className="divide-y divide-zinc-100 rounded border border-zinc-200 text-sm">
                <SummaryRow label="Company" value={companyName || "—"} />
                <SummaryRow
                  label="Company type"
                  value={
                    data?.categories.find((c) => c.id === companyCategory)
                      ?.label ?? companyCategory
                  }
                />
                <SummaryRow
                  label="Warehouse"
                  value={
                    [warehouseName, warehouseAddress, warehouseCity]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
                <SummaryRow
                  label="Units"
                  value={validUnits.map((u) => u.label).join(", ") || "—"}
                />
                <SummaryRow
                  label="Modules"
                  value={[
                    modules.vehicles && "Vehicles",
                    modules.dispatch && "Dispatch",
                    modules.warehouse && "Warehouse",
                    modules.returns && "Returns",
                    modules.employeePortal && "Employee portal",
                    modules.useInvoices && "Invoices",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
              </dl>
              {preset?.suggestedUnits && (
                <p className="text-xs text-zinc-500">
                  Suggested defaults for your category were applied — you can
                  customize anything above.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || saving}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                disabled={
                  (step === 0 && !companyName.trim()) ||
                  (step === 1 &&
                    (!warehouseName.trim() || !warehouseAddress.trim())) ||
                  (step === 2 && validUnits.length === 0) ||
                  saving
                }
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button type="button" disabled={saving} onClick={finishSetup}>
                {saving ? "Saving…" : "Finish setup"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}
