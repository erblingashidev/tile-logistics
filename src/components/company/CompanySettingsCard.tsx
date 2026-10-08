"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMPANY_CATEGORIES,
  PRODUCT_FOCUS_OPTIONS,
  type CompanyCategory,
  type CompanyModuleFlags,
  type ProductFocus,
} from "@/lib/company-profile";
import { broadcastFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import { parseFeatureFlags } from "@/lib/features/catalog";
import { Alert, Button, Card, Input, LoadingState, Switch } from "@/components/ui";

const MODULE_LABELS: { key: keyof CompanyModuleFlags; label: string; hint: string }[] =
  [
    { key: "useInvoices", label: "Invoice import", hint: "Import invoices into orders" },
    { key: "vehicles", label: "Fleet", hint: "Vehicles and maintenance" },
    { key: "dispatch", label: "Dispatch & logistics", hint: "Dispatch board, map, delivery rounds" },
    { key: "warehouse", label: "Warehouse (WMS)", hint: "Stock, locations, portal unloading" },
    { key: "returns", label: "Returns", hint: "Customer returns workflow" },
    {
      key: "employeePortal",
      label: "Employee portal",
      hint: "Drivers and warehouse staff use phones in the field",
    },
  ];

export function CompanySettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [companyCategory, setCompanyCategory] = useState<CompanyCategory>("general");
  const [productFocus, setProductFocus] = useState<ProductFocus>("general");
  const [modules, setModules] = useState<CompanyModuleFlags>({
    vehicles: false,
    dispatch: false,
    warehouse: false,
    returns: true,
    employeePortal: false,
    useInvoices: true,
  });
  const [warehouse, setWarehouse] = useState({
    name: "",
    address: "",
    city: "",
    lat: "",
    lng: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/company/profile", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not load company profile.");
        return;
      }
      setOrganizationName(data.organizationName ?? "");
      const profile = data.profile;
      if (profile) {
        setCompanyCategory(profile.companyCategory ?? "general");
        setProductFocus(profile.productFocus ?? "general");
        setModules({ ...profile.modules });
      }
      const wh = data.warehouse ?? profile?.warehouse;
      if (wh) {
        setWarehouse({
          name: wh.name ?? "",
          address: wh.address ?? "",
          city: wh.city ?? "",
          lat: String(wh.lat ?? ""),
          lng: String(wh.lng ?? ""),
        });
      }
    } catch {
      setError("Could not load company profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const lat = Number(warehouse.lat);
      const lng = Number(warehouse.lng);
      const res = await fetch("/api/company/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: organizationName.trim() || undefined,
          companyCategory,
          productFocus,
          modules,
          warehouse:
            warehouse.name.trim() && warehouse.address.trim()
              ? {
                  name: warehouse.name.trim(),
                  address: warehouse.address.trim(),
                  city: warehouse.city.trim() || undefined,
                  lat: Number.isFinite(lat) ? lat : 0,
                  lng: Number.isFinite(lng) ? lng : 0,
                }
              : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save company settings.");
        return;
      }
      await fetch("/api/auth/refresh-session", { method: "POST" });
      const flagsRes = await fetch("/api/settings/features", { cache: "no-store" });
      if (flagsRes.ok) {
        const flags = parseFeatureFlags(await flagsRes.json());
        broadcastFeatureFlags(flags);
      }
      setSuccess("Company settings saved. Modules may take a refresh to appear in the menu.");
      setTimeout(() => setSuccess(""), 5000);
    } catch {
      setError("Could not save company settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-5">
        <LoadingState title="Loading company settings…" />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Company
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900">Business profile</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        Company admins can change modules and depot details here without contacting
        platform support. Changes apply to your organization only.
      </p>

      <form onSubmit={save} className="mt-5 space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="info">{success}</Alert>}

        <Input
          label="Company display name"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          required
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Company type
          </label>
          <select
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            value={companyCategory}
            onChange={(e) => setCompanyCategory(e.target.value as CompanyCategory)}
          >
            {COMPANY_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
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
            {PRODUCT_FOCUS_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Modules</h3>
          {MODULE_LABELS.map((item) => (
            <Switch
              key={item.key}
              label={item.label}
              description={item.hint}
              checked={modules[item.key]}
              onCheckedChange={(checked) =>
                setModules((m) => ({ ...m, [item.key]: checked }))
              }
            />
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Main depot / warehouse</h3>
          <p className="text-xs text-zinc-600">
            Used on the map and routing. Required if warehouse or dispatch is on.
          </p>
          <Input
            label="Name"
            value={warehouse.name}
            onChange={(e) => setWarehouse((w) => ({ ...w, name: e.target.value }))}
          />
          <Input
            label="Address"
            value={warehouse.address}
            onChange={(e) => setWarehouse((w) => ({ ...w, address: e.target.value }))}
          />
          <Input
            label="City"
            value={warehouse.city}
            onChange={(e) => setWarehouse((w) => ({ ...w, city: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Latitude"
              value={warehouse.lat}
              onChange={(e) => setWarehouse((w) => ({ ...w, lat: e.target.value }))}
            />
            <Input
              label="Longitude"
              value={warehouse.lng}
              onChange={(e) => setWarehouse((w) => ({ ...w, lng: e.target.value }))}
            />
          </div>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save company settings"}
        </Button>
      </form>
    </Card>
  );
}
