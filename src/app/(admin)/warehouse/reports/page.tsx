"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageSection,
  Select,
  tableClass,
} from "@/components/ui";
import {
  WAREHOUSE_INCIDENT_CATEGORIES,
  WAREHOUSE_INCIDENT_CATEGORY_LABELS,
  type WarehouseIncidentCategory,
} from "@/lib/constants";
import { formatReportWeek } from "@/lib/warehouse-report-week";

interface ReportRow {
  id: number;
  reportType: string;
  scope: string;
  zone: string | null;
  zones: string[];
  category: string;
  body: string;
  reportWeek: string | null;
  createdAt: string;
  employee: { id: number; name: string };
  taggedLeaders: Array<{ id: number; name: string }>;
  photos: Array<{ id: number; url: string }>;
}

interface EditRequestRow {
  id: number;
  reportId: number;
  proposedBody: string;
  reason: string | null;
  createdAt: string;
  employeeName: string;
  reportType: string;
  reportBody: string;
  reportCategory: string;
}

interface WeekData {
  reportWeek: string;
  wednesdayLabel: string;
  weekly: ReportRow[];
  incidents: ReportRow[];
  availableWeeks: string[];
  pendingEditRequests: EditRequestRow[];
}

function ReportBlock({
  report,
  onEdit,
  onDelete,
}: {
  report: ReportRow;
  onEdit: (report: ReportRow) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-900">{report.employee.name}</p>
          <p className="text-xs text-zinc-500">
            {new Date(report.createdAt).toLocaleString()}
            {report.zones.length > 0
              ? ` · ${report.zones.join(", ")}`
              : report.zone
                ? ` · ${report.zone}`
                : report.scope === "warehouse"
                  ? " · Whole warehouse"
                  : ""}
          </p>
        </div>
        <Badge tone={report.reportType === "weekly" ? "blue" : "amber"}>
          {report.reportType === "weekly"
            ? "Weekly"
            : WAREHOUSE_INCIDENT_CATEGORY_LABELS[
                report.category as WarehouseIncidentCategory
              ] ?? report.category}
        </Badge>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{report.body}</p>
      {report.taggedLeaders.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Tagged leaders: {report.taggedLeaders.map((l) => l.name).join(", ")}
        </p>
      )}
      {report.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.photos.map((photo) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
              <img
                src={photo.url}
                alt=""
                className="h-20 w-20 rounded border object-cover"
              />
            </a>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
        <Button variant="secondary" size="sm" onClick={() => onEdit(report)}>
          Edit
        </Button>
        <Button variant="danger" size="sm" onClick={() => onDelete(report.id)}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

export default function WarehouseReportsAdminPage() {
  const [week, setWeek] = useState(formatReportWeek(new Date()));
  const [data, setData] = useState<WeekData | null>(null);
  const [editingReport, setEditingReport] = useState<ReportRow | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/warehouse/reports?week=${week}`);
    setData(await res.json());
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(report: ReportRow) {
    setEditingReport(report);
    setEditBody(report.body);
    setEditCategory(report.category);
  }

  async function saveEdit() {
    if (!editingReport) return;
    const res = await fetch(`/api/warehouse/reports/${editingReport.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: editBody,
        ...(editingReport.reportType === "incident"
          ? { category: editCategory }
          : {}),
      }),
    });
    if (!res.ok) {
      window.alert((await res.json()).error ?? "Save failed");
      return;
    }
    setEditingReport(null);
    load();
  }

  async function deleteReport(id: number) {
    if (!window.confirm("Delete this report permanently?")) return;
    const res = await fetch(`/api/warehouse/reports/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      window.alert((await res.json()).error ?? "Delete failed");
      return;
    }
    load();
  }

  async function reviewEditRequest(
    requestId: number,
    action: "approve" | "reject"
  ) {
    const res = await fetch(`/api/warehouse/reports/edit-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        adminNote: reviewNotes[requestId] ?? "",
      }),
    });
    if (!res.ok) {
      window.alert((await res.json()).error ?? "Review failed");
      return;
    }
    setReviewNotes((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    load();
  }

  return (
    <AppShell
      title="Warehouse reports"
      description="Weekly reports and incidents."
    >
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>

      {editingReport && (
        <Card className="mb-6 space-y-3 p-4">
          <p className="font-medium">
            Edit report — {editingReport.employee.name}
          </p>
          {editingReport.reportType === "incident" && (
            <Select
              label="Category"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              {WAREHOUSE_INCIDENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {WAREHOUSE_INCIDENT_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </Select>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">
              Report text
            </span>
            <textarea
              className="min-h-32 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button onClick={saveEdit}>Save</Button>
            <Button variant="secondary" onClick={() => setEditingReport(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <PageSection title="Reporting week (Wednesday)">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Select
            label="Week"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          >
            {(data?.availableWeeks ?? [week]).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        </Card>
      </PageSection>

      {!data ? (
        <EmptyState title="Loading…" />
      ) : (
        <>
          {data.pendingEditRequests.length > 0 && (
            <PageSection
              title={`Edit requests awaiting approval (${data.pendingEditRequests.length})`}
            >
              <div className="space-y-3">
                {data.pendingEditRequests.map((request) => (
                  <Card key={request.id} className="space-y-3 p-4">
                    <div>
                      <p className="font-medium text-zinc-900">
                        {request.employeeName} — report #{request.reportId}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(request.createdAt).toLocaleString()} ·{" "}
                        {request.reportType}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-zinc-500">
                          Current
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-zinc-700">
                          {request.reportBody}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-zinc-500">
                          Requested change
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-zinc-900">
                          {request.proposedBody}
                        </p>
                      </div>
                    </div>
                    {request.reason && (
                      <p className="text-xs text-zinc-500">
                        Reason: {request.reason}
                      </p>
                    )}
                    <Input
                      placeholder="Note to employee (optional)"
                      value={reviewNotes[request.id] ?? ""}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({
                          ...prev,
                          [request.id]: e.target.value,
                        }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => reviewEditRequest(request.id, "approve")}>
                        Approve & apply
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => reviewEditRequest(request.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </PageSection>
          )}

          <p className="mb-6 text-sm text-zinc-600">
            Reports for <strong>{data.wednesdayLabel}</strong> — incidents from
            the 7 days after that Wednesday are bundled here.
          </p>

          <PageSection title={`Weekly reports (${data.weekly.length})`}>
            {data.weekly.length === 0 ? (
              <EmptyState title="No weekly reports for this week yet." />
            ) : (
              <div className="space-y-3">
                {data.weekly.map((report) => (
                  <ReportBlock
                    key={report.id}
                    report={report}
                    onEdit={openEdit}
                    onDelete={deleteReport}
                  />
                ))}
              </div>
            )}
          </PageSection>

          <PageSection title={`Incidents (${data.incidents.length})`}>
            {data.incidents.length === 0 ? (
              <EmptyState title="No incidents in this reporting period." />
            ) : (
              <div className="space-y-3">
                {data.incidents.map((report) => (
                  <ReportBlock
                    key={report.id}
                    report={report}
                    onEdit={openEdit}
                    onDelete={deleteReport}
                  />
                ))}
              </div>
            )}
          </PageSection>

          <PageSection title="Summary table">
            <Card className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Type</th>
                    <th>Zone(s)</th>
                    <th>Tagged</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.weekly, ...data.incidents].map((report) => (
                    <tr key={report.id}>
                      <td>{new Date(report.createdAt).toLocaleString()}</td>
                      <td>{report.employee.name}</td>
                      <td>
                        {report.reportType === "weekly"
                          ? "Weekly"
                          : report.category}
                      </td>
                      <td>
                        {report.zones.join(", ") ||
                          report.zone ||
                          (report.scope === "warehouse" ? "All" : "—")}
                      </td>
                      <td>
                        {report.taggedLeaders.map((l) => l.name).join(", ") ||
                          "—"}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => openEdit(report)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-red-600"
                            onClick={() => deleteReport(report.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
