"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PortalCard,
  PortalChip,
  PortalSectionTitle,
  PortalShell,
  PortalTabs,
} from "@/components/portal/PortalShell";
import { Badge, Button, Input, Select, Textarea, Alert } from "@/components/ui";
import { sq } from "@/lib/i18n/sq";
import { WAREHOUSE_INCIDENT_CATEGORIES } from "@/lib/constants";
import type { EmployeeRole } from "@/lib/constants";

interface EditRequest {
  id: number;
  status: string;
  proposedBody: string;
  reason: string | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface ReportItem {
  id: number;
  reportType: string;
  category: string;
  body: string;
  zone: string | null;
  zones: string[];
  reportWeek: string | null;
  createdAt: string;
  photos: Array<{ id: number; url: string }>;
  taggedLeaders: Array<{ id: number; name: string }>;
  editRequest: EditRequest | null;
}

interface PortalContext {
  employee: { id: number; name: string; roles: string[] };
  zones: string[];
  allZones: string[];
  groupLeaders: Array<{ id: number; name: string; zones: string[] }>;
  reportWeek: string;
  isWednesday: boolean;
  wednesdayLabel: string;
  canReportWholeWarehouse: boolean;
  canSubmitWeekly: boolean;
  isGroupLeader: boolean;
  recentReports: ReportItem[];
}

function reportTypeLabel(report: ReportItem) {
  if (report.reportType === "weekly") return sq.reportsWeekly;
  return sq.incidentCategories[report.category] ?? report.category;
}

function formatReportDate(value: string) {
  return new Date(value).toLocaleString("sq-AL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortalReportsPage() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [ctx, setCtx] = useState<PortalContext | null>(null);
  const [tab, setTab] = useState<"incident" | "weekly">("incident");
  const [category, setCategory] = useState("damage");
  const [zone, setZone] = useState("");
  const [body, setBody] = useState("");
  const [taggedLeaderIds, setTaggedLeaderIds] = useState<number[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [proposedBody, setProposedBody] = useState("");
  const [editReason, setEditReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/portal/warehouse-reports");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.status === 403) {
      setError(sq.reportsNoAccess);
      return;
    }
    const data = await res.json();
    setCtx(data);
    if (data.zones?.length === 1) {
      setZone((prev) => prev || data.zones[0]);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleLeader(id: number) {
    setTaggedLeaderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotos((prev) => [...prev, ...Array.from(files)]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditRequest(report: ReportItem) {
    setEditReportId(report.id);
    setProposedBody(report.body);
    setEditReason("");
  }

  async function submitEditRequest(reportId: number) {
    setError("");
    setSuccess("");
    const res = await fetch(
      `/api/portal/warehouse-reports/${reportId}/edit-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedBody,
          reason: editReason,
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }
    setEditReportId(null);
    setProposedBody("");
    setEditReason("");
    setSuccess(sq.reportsEditSuccess);
    load();
  }

  async function submit() {
    if (!ctx) return;
    setError("");
    setSuccess("");

    const form = new FormData();
    form.set("reportType", tab);
    form.set("category", category);
    form.set("body", body);
    form.set("reportWeek", ctx.reportWeek);
    if (zone) form.set("zone", zone);
    for (const id of taggedLeaderIds) {
      form.append("taggedLeaderIds", String(id));
    }
    for (const file of photos) {
      form.append("photos", file);
    }

    const res = await fetch("/api/portal/warehouse-reports", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }

    setSuccess(
      data.photoWarning
        ? `${sq.reportsSuccess} ${sq.reportsPhotoWarning}`
        : sq.reportsSuccess
    );
    setBody("");
    setPhotos([]);
    setTaggedLeaderIds([]);
    load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const zoneOptions =
    ctx?.canReportWholeWarehouse && tab === "incident"
      ? ctx.allZones
      : ctx?.zones.length
        ? ctx.zones
        : ctx?.allZones ?? [];

  return (
    <PortalShell
      title={sq.reportsTitle}
      subtitle={ctx?.employee.name}
      activeNav="reports"
      showOrders
      showWms={
        ctx?.employee.roles.some((r) =>
          (
            [
              "warehouse_admin",
              "warehouse_reporter",
              "group_leader",
              "picker",
              "unloader",
              "maintainer",
            ] as EmployeeRole[]
          ).includes(r as EmployeeRole)
        ) ?? false
      }
      showReports
      onLogout={logout}
      onRefresh={refreshNow}
      refreshing={refreshing}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="info">{success}</Alert>}

      {!ctx ? (
        <PortalCard>
          <p className="text-sm text-zinc-500">…</p>
        </PortalCard>
      ) : (
        <>
          <PortalTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "incident", label: sq.reportsIncident },
              ...(ctx.canSubmitWeekly
                ? [{ id: "weekly" as const, label: sq.reportsWeekly }]
                : []),
            ]}
          />

          {tab === "weekly" && (
            <PortalCard className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {sq.reportsWeeklyDue}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    {ctx.wednesdayLabel}
                  </p>
                </div>
                <Badge tone={ctx.isWednesday ? "green" : "amber"}>
                  {ctx.isWednesday ? "Sot" : "Javë aktive"}
                </Badge>
              </div>
              {!ctx.isWednesday && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
                  {sq.reportsNotWednesday}
                </p>
              )}
              {ctx.canReportWholeWarehouse && (
                <p className="text-sm text-zinc-600">{sq.reportsWholeWarehouse}</p>
              )}
              {ctx.isGroupLeader && ctx.zones.length > 0 && (
                <p className="text-sm text-zinc-600">
                  Zonat tuaja:{" "}
                  <span className="font-medium text-zinc-900">
                    {ctx.zones.join(", ")}
                  </span>
                </p>
              )}
            </PortalCard>
          )}

          <PortalCard className="space-y-4">
            {tab === "incident" && (
              <Select
                label={sq.reportsCategory}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {WAREHOUSE_INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {sq.incidentCategories[cat] ?? cat}
                  </option>
                ))}
              </Select>
            )}

            {(tab === "incident" || ctx.isGroupLeader) &&
              !(
                tab === "weekly" &&
                ctx.canReportWholeWarehouse &&
                !ctx.isGroupLeader
              ) && (
                <Select
                  label={sq.reportsZone}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                >
                  <option value="">
                    {ctx.canReportWholeWarehouse && tab === "incident"
                      ? sq.reportsWholeWarehouse
                      : sq.reportsSelectZone}
                  </option>
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              )}

            {tab === "weekly" && ctx.canReportWholeWarehouse && (
              <div>
                <p className="mb-3 text-xs font-medium text-zinc-600">
                  {sq.reportsTagLeaders}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ctx.groupLeaders.map((leader) => (
                    <PortalChip
                      key={leader.id}
                      selected={taggedLeaderIds.includes(leader.id)}
                      onClick={() => toggleLeader(leader.id)}
                    >
                      {leader.name}
                      {leader.zones.length > 0 && (
                        <span className="ml-1 opacity-70">
                          · {leader.zones.join(", ")}
                        </span>
                      )}
                    </PortalChip>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              label={sq.reportsBody}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              className="min-h-32"
              placeholder="Shkruaj detajet e raportit…"
            />

            <div>
              <p className="mb-3 text-xs font-medium text-zinc-600">
                {sq.reportsPhotos}
              </p>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:flex-1"
                    onClick={() => cameraRef.current?.click()}
                  >
                    {sq.reportsTakePhoto}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:flex-1"
                    onClick={() => galleryRef.current?.click()}
                  >
                    {sq.reportsFromGallery}
                  </Button>
                </div>
                {photos.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {photos.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="relative">
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="h-20 w-20 rounded-xl object-cover ring-1 ring-zinc-200"
                        />
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm"
                          onClick={() => removePhoto(index)}
                        >
                          {sq.reportsRemovePhoto}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full py-4 text-base font-semibold"
              disabled={!body.trim()}
              onClick={submit}
            >
              {sq.reportsSubmit}
            </Button>
          </PortalCard>

          {ctx.recentReports.length > 0 && (
            <section className="space-y-3">
              <PortalSectionTitle>{sq.reportsRecent}</PortalSectionTitle>
              <div className="space-y-3">
                {ctx.recentReports.map((report) => (
                  <PortalCard key={report.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge
                          tone={
                            report.reportType === "weekly" ? "blue" : "amber"
                          }
                        >
                          {reportTypeLabel(report)}
                        </Badge>
                        <p className="mt-2 text-xs text-zinc-500">
                          {formatReportDate(report.createdAt)}
                          {report.zone ? ` · ${report.zone}` : ""}
                          {report.zones.length > 0
                            ? ` · ${report.zones.join(", ")}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                      {report.body}
                    </p>

                    {report.editRequest?.status === "pending" && (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {sq.reportsEditPending}
                      </p>
                    )}
                    {report.editRequest?.status === "approved" && (
                      <p className="rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800">
                        {sq.reportsEditApproved}
                      </p>
                    )}
                    {report.editRequest?.status === "rejected" && (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
                        {sq.reportsEditRejected}
                        {report.editRequest.adminNote
                          ? `: ${report.editRequest.adminNote}`
                          : ""}
                      </p>
                    )}

                    {report.taggedLeaders.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        {sq.reportsTagLeaders}:{" "}
                        <span className="font-medium text-zinc-700">
                          {report.taggedLeaders.map((l) => l.name).join(", ")}
                        </span>
                      </p>
                    )}

                    {report.photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {report.photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={photo.url}
                              alt=""
                              className="h-20 w-20 rounded-xl object-cover ring-1 ring-zinc-200"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {editReportId === report.id ? (
                      <div className="space-y-3 border-t border-zinc-100 pt-3">
                        <Textarea
                          label={sq.reportsProposedText}
                          value={proposedBody}
                          onChange={(e) => setProposedBody(e.target.value)}
                          rows={4}
                        />
                        <Input
                          placeholder={sq.reportsEditReason}
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            className="w-full sm:w-auto"
                            onClick={() => submitEditRequest(report.id)}
                            disabled={!proposedBody.trim()}
                          >
                            {sq.reportsEditSubmit}
                          </Button>
                          <Button
                            variant="secondary"
                            className="w-full sm:w-auto"
                            onClick={() => setEditReportId(null)}
                          >
                            {sq.reportsCancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      report.editRequest?.status !== "pending" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEditRequest(report)}
                        >
                          {sq.reportsRequestEdit}
                        </Button>
                      )
                    )}
                  </PortalCard>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PortalShell>
  );
}
