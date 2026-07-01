"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface Session {
  id: number;
  name: string;
  status: string;
  startedAt: string;
  notes?: string | null;
}

interface ZoneStatus {
  zone: string;
  status: string;
  sectorCountId: number | null;
  lineCount: number;
  totalM2: number;
}

interface Line {
  id: number;
  ean: string | null;
  quantityM2: number;
  productName: string | null;
  locationCode: string | null;
  locationId: number | null;
  zone: string | null;
  countedAt: string;
}

interface EditLineForm {
  ean: string;
  quantityM2: string;
  zone: string;
  locationId: string;
}

interface VarianceLine {
  ean: string | null;
  productName: string | null;
  locationCode: string | null;
  zone: string | null;
  bookM2: number;
  countedM2: number;
  differenceM2: number;
  previousCountedM2: number | null;
  changeSinceLastM2: number | null;
}

interface VarianceReport {
  id: number;
  sessionId: number;
  totalLines: number;
  totalVarianceM2: number;
  createdAt: string;
}

export default function WarehouseInventoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState<Session | null>(null);
  const [zones, setZones] = useState<ZoneStatus[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [locations, setLocations] = useState<
    Array<{ id: number; code: string; zone: string | null }>
  >([]);
  const [sessionName, setSessionName] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [activeSectorId, setActiveSectorId] = useState<number | null>(null);
  const [lineForm, setLineForm] = useState({ ean: "", quantityM2: "", locationId: "" });
  const [reportId, setReportId] = useState<number | null>(null);
  const [varianceLines, setVarianceLines] = useState<VarianceLine[]>([]);
  const [latestReport, setLatestReport] = useState<VarianceReport | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<string>("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [allLocations, setAllLocations] = useState<
    Array<{ id: number; code: string; zone: string | null }>
  >([]);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editLineForm, setEditLineForm] = useState<EditLineForm>({
    ean: "",
    quantityM2: "",
    zone: "",
    locationId: "",
  });
  const [actionError, setActionError] = useState("");
  const [viewedPastSession, setViewedPastSession] = useState<Session | null>(null);
  const [pastLines, setPastLines] = useState<Line[]>([]);
  const [pastZones, setPastZones] = useState<ZoneStatus[]>([]);
  const [pastReports, setPastReports] = useState<VarianceReport[]>([]);
  const [editingPastSessionId, setEditingPastSessionId] = useState<number | null>(
    null
  );
  const [pastEditForm, setPastEditForm] = useState({ name: "", notes: "" });
  const [editLineZoneOptions, setEditLineZoneOptions] = useState<string[]>([]);

  const loadPastSession = useCallback(async (session: Session) => {
    const detail = await fetch(
      `/api/warehouse/inventory?sessionId=${session.id}`
    );
    const detailData = await detail.json();
    setViewedPastSession(session);
    setPastLines(detailData.lines ?? []);
    setPastZones(detailData.zones ?? []);
    setPastReports(detailData.reports ?? []);
    if (detailData.reports?.[0]) {
      setReportId(detailData.reports[0].id);
    }
  }, []);

  const load = useCallback(async () => {
    const inv = await fetch("/api/warehouse/inventory");
    const data = await inv.json();
    setSessions(data.sessions ?? []);
    setOpen(data.open ?? null);
    setLatestReport(data.latestReport ?? null);

    if (data.open) {
      const detail = await fetch(
        `/api/warehouse/inventory?sessionId=${data.open.id}`
      );
      const detailData = await detail.json();
      setZones(detailData.zones ?? []);
      setLines(detailData.lines ?? []);
      setSessionNotes(data.open.notes ?? "");

      const active = (detailData.zones as ZoneStatus[] | undefined)?.find(
        (z) => z.status === "counting" && z.sectorCountId
      );
      setActiveSectorId(active?.sectorCountId ?? null);
      setSelectedZone(active?.zone ?? "");
    } else {
      setZones([]);
      setLines([]);
      setActiveSectorId(null);
      setEditingLineId(null);
      setSessionNotes("");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open && !viewedPastSession) {
      setAllLocations([]);
      return;
    }
    fetch("/api/warehouse/stock?view=locations")
      .then((r) => r.json())
      .then((all: Array<{ id: number; code: string; zone: string | null }>) =>
        setAllLocations(all)
      )
      .catch(() => setAllLocations([]));
  }, [open, viewedPastSession]);

  useEffect(() => {
    if (latestReport && !reportId) {
      setReportId(latestReport.id);
    }
  }, [latestReport, reportId]);

  useEffect(() => {
    if (!selectedZone) {
      setLocations([]);
      return;
    }
    fetch("/api/warehouse/stock?view=locations")
      .then((r) => r.json())
      .then((all: Array<{ id: number; code: string; zone: string | null }>) => {
        setLocations(all.filter((l) => (l.zone?.trim() || "") === selectedZone));
      })
      .catch(() => setLocations([]));
  }, [selectedZone]);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/warehouse/inventory?reportId=${reportId}`)
      .then((r) => r.json())
      .then((data) => setVarianceLines(data.lines ?? []))
      .catch(() => setVarianceLines([]));
  }, [reportId]);

  async function startSession() {
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        name: sessionName || `Inventar ${new Date().getFullYear()}`,
      }),
    });
    setSessionName("");
    load();
  }

  async function startSector(zone: string) {
    if (!open) return;
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start_sector",
        sessionId: open.id,
        zone,
      }),
    });
    const data = await res.json();
    if (data.sector) {
      setActiveSectorId(data.sector.id);
      setSelectedZone(zone);
    }
    load();
  }

  async function closeSector() {
    if (!activeSectorId) return;
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close_sector",
        sectorCountId: activeSectorId,
      }),
    });
    setActiveSectorId(null);
    load();
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!open || !activeSectorId || !selectedZone) return;
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "line",
        sessionId: open.id,
        ean: lineForm.ean,
        quantityM2: Number(lineForm.quantityM2),
        locationId: Number(lineForm.locationId),
        zone: selectedZone,
        sectorCountId: activeSectorId,
      }),
    });
    setLineForm({ ean: "", quantityM2: "", locationId: "" });
    load();
  }

  async function saveSessionDetails() {
    if (!open) return;
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_session",
        sessionId: open.id,
        name: sessionName || open.name,
        notes: sessionNotes,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    setEditingSessionName(false);
    setSessionName("");
    load();
  }

  async function cancelSession() {
    if (!open) return;
    if (
      !confirm(
        "Cancel this inventory session? All count lines and sector progress will be deleted. Stock will NOT be changed."
      )
    ) {
      return;
    }
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        sessionId: open.id,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    setFinalizeResult("");
    setEditingLineId(null);
    load();
  }

  async function reopenSector(zone: ZoneStatus) {
    if (!zone.sectorCountId) return;
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reopen_sector",
        sectorCountId: zone.sectorCountId,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    if (data.sector) {
      setActiveSectorId(data.sector.id);
      setSelectedZone(zone.zone);
    }
    load();
  }

  function startEditLine(line: Line, zoneOpts: string[]) {
    setEditLineZoneOptions(zoneOpts);
    setEditingLineId(line.id);
    setEditLineForm({
      ean: line.ean ?? "",
      quantityM2: String(line.quantityM2),
      zone: line.zone ?? "",
      locationId: line.locationId ? String(line.locationId) : "",
    });
  }

  async function refreshAfterLineChange() {
    setEditingLineId(null);
    if (viewedPastSession) {
      const refreshed = await fetch("/api/warehouse/inventory");
      const data = await refreshed.json();
      setSessions(data.sessions ?? []);
      const updated = (data.sessions as Session[] | undefined)?.find(
        (s) => s.id === viewedPastSession.id
      );
      if (updated) await loadPastSession(updated);
      else {
        setViewedPastSession(null);
        setPastLines([]);
      }
    }
    load();
  }

  async function saveEditLine(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLineId) return;
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_line",
        lineId: editingLineId,
        ean: editLineForm.ean,
        quantityM2: Number(editLineForm.quantityM2),
        zone: editLineForm.zone,
        locationId: Number(editLineForm.locationId),
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    await refreshAfterLineChange();
  }

  async function deleteLine(line: Line) {
    if (
      !confirm(
        `Delete count for ${line.ean ?? "item"} · ${formatM2(line.quantityM2)} m²?`
      )
    ) {
      return;
    }
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_line",
        lineId: line.id,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    await refreshAfterLineChange();
  }

  async function savePastSessionEdit(sessionId: number) {
    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_session",
        sessionId,
        name: pastEditForm.name,
        notes: pastEditForm.notes,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    setEditingPastSessionId(null);
    if (viewedPastSession?.id === sessionId && data.id) {
      await loadPastSession(data);
    }
    load();
  }

  async function deletePastSession(session: Session) {
    const message =
      session.status === "closed"
        ? `Delete "${session.name}" permanently? Stock adjustments from this inventory will NOT be reversed — only the session record is removed.`
        : `Delete "${session.name}" permanently? All count lines and reports for this session will be removed.`;
    if (!confirm(message)) return;

    setActionError("");
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_session",
        sessionId: session.id,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setActionError(data.error);
      return;
    }
    if (viewedPastSession?.id === session.id) {
      setViewedPastSession(null);
      setPastLines([]);
      setPastZones([]);
      setPastReports([]);
    }
    if (reportId && pastReports.some((r) => r.id === reportId)) {
      setReportId(null);
      setVarianceLines([]);
    }
    load();
  }

  function zoneOptionsFrom(
    zoneList: ZoneStatus[],
    lineList: Line[]
  ): string[] {
    const fromZones = zoneList.map((z) => z.zone);
    const fromLines = lineList
      .map((l) => l.zone)
      .filter((z): z is string => Boolean(z?.trim()));
    return [...new Set([...fromZones, ...fromLines])];
  }

  function renderCountLines(
    lineList: Line[],
    canEdit: boolean,
    zoneOpts: string[]
  ) {
    const editLocationsForForm = allLocations.filter(
      (l) => (l.zone?.trim() || "") === editLineForm.zone
    );

    if (lineList.length === 0) {
      return <EmptyState title="No counts in this session." />;
    }

    return (
      <div className="space-y-2">
        {lineList.map((line) => (
          <Card key={line.id} className="p-3 text-sm">
            {editingLineId === line.id ? (
              <form
                onSubmit={saveEditLine}
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
              >
                <Input
                  placeholder="EAN"
                  value={editLineForm.ean}
                  onChange={(e) =>
                    setEditLineForm({ ...editLineForm, ean: e.target.value })
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="m²"
                  value={editLineForm.quantityM2}
                  onChange={(e) =>
                    setEditLineForm({
                      ...editLineForm,
                      quantityM2: e.target.value,
                    })
                  }
                />
                <Select
                  value={editLineForm.zone}
                  onChange={(e) =>
                    setEditLineForm({
                      ...editLineForm,
                      zone: e.target.value,
                      locationId: "",
                    })
                  }
                >
                  <option value="">Zone</option>
                  {(editLineZoneOptions.length > 0
                    ? editLineZoneOptions
                    : zoneOpts
                  ).map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
                <Select
                  value={editLineForm.locationId}
                  onChange={(e) =>
                    setEditLineForm({
                      ...editLineForm,
                      locationId: e.target.value,
                    })
                  }
                >
                  <option value="">Location</option>
                  {editLocationsForForm.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingLineId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {line.zone ? `${line.zone} · ` : ""}
                  {line.ean} · {formatM2(line.quantityM2)} m²
                  {line.locationCode ? ` · ${line.locationCode}` : ""}
                  {line.productName ? ` · ${line.productName}` : ""}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEditLine(line, zoneOpts)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteLine(line)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  }

  async function finalizeSession() {
    if (!open) return;
    if (
      !confirm(
        "Finalize inventory? This applies counted stock and generates a variance report vs the last inventory."
      )
    ) {
      return;
    }
    const res = await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        sessionId: open.id,
      }),
    });
    const data = await res.json();
    if (data.reportId) {
      setFinalizeResult(
        `Applied ${data.applied} adjustments · ${data.reportLines} variance lines · total |Δ| ${formatM2(data.totalVarianceM2)} m²`
      );
      setReportId(data.reportId);
    } else if (data.error) {
      setFinalizeResult(data.error);
    }
    load();
  }

  const canFinalize =
    open &&
    lines.length > 0 &&
    zones.every((z) => z.status !== "counting");
  const pendingZones = zones.filter((z) => z.status === "pending").length;
  const openZoneOptions = zoneOptionsFrom(zones, lines);
  const pastZoneOptions = zoneOptionsFrom(pastZones, pastLines);
  const pastSessions = sessions.filter((s) => s.status !== "open");

  return (
    <AppShell
      title="Annual inventory"
      description="Count by warehouse zone, close each sector, then finalize stock and variance report."
    >
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>

      {!open ? (
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
            <Button onClick={startSession}>Start inventory</Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mb-6 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingSessionName ? (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={sessionName || open.name}
                      onChange={(e) => setSessionName(e.target.value)}
                      placeholder="Session name"
                    />
                    <Button size="sm" onClick={saveSessionDetails}>
                      Save name
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingSessionName(false);
                        setSessionName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{open.name}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSessionName(open.name);
                        setEditingSessionName(true);
                      }}
                    >
                      Edit name
                    </Button>
                  </div>
                )}
                <Badge tone="green">Open</Badge>
                <p className="mt-2 text-xs text-zinc-500">
                  Admin only: edit or delete count lines below, reopen closed sectors, or cancel the whole session.
                </p>
                <div className="mt-3">
                  <Input
                    label="Session notes"
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="secondary"
                    onClick={saveSessionDetails}
                  >
                    Save notes
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={finalizeSession}
                  disabled={!canFinalize}
                >
                  Finalize & apply stock
                </Button>
                <Button variant="danger" onClick={cancelSession}>
                  Cancel inventory
                </Button>
              </div>
            </div>
            {!canFinalize && open && (
              <p className="mt-2 text-xs text-amber-700">
                Close any open sector before finalizing. Add at least one count line.
              </p>
            )}
            {canFinalize && pendingZones > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                {pendingZones} zone(s) were not counted — finalize applies only scanned locations.
              </p>
            )}
            {finalizeResult && (
              <p className="mt-2 text-sm text-zinc-600">{finalizeResult}</p>
            )}
            {actionError && (
              <p className="mt-2 text-sm text-red-700">{actionError}</p>
            )}
          </Card>

          <Card className="mb-6 p-4">
            <h2 className="mb-3 font-semibold">Zones / sectors</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((zone) => (
                <div
                  key={zone.zone}
                  className="rounded-lg border border-zinc-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{zone.zone}</span>
                    <Badge
                      tone={
                        zone.status === "closed"
                          ? "green"
                          : zone.status === "counting"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {zone.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {zone.lineCount} lines · {formatM2(zone.totalM2)} m²
                  </p>
                  {zone.status === "closed" && zone.sectorCountId && (
                    <Button
                      className="mt-2"
                      variant="secondary"
                      size="sm"
                      onClick={() => reopenSector(zone)}
                    >
                      Reopen sector
                    </Button>
                  )}
                  {zone.status !== "closed" && (
                    <Button
                      className="mt-2"
                      variant="secondary"
                      onClick={() =>
                        zone.status === "counting" && zone.sectorCountId
                          ? (setActiveSectorId(zone.sectorCountId),
                            setSelectedZone(zone.zone))
                          : startSector(zone.zone)
                      }
                    >
                      {zone.status === "counting" ? "Continue" : "Start sector"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {activeSectorId && selectedZone && (
            <Card className="mb-6 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-medium">Counting: {selectedZone}</p>
                <Button variant="secondary" onClick={closeSector}>
                  Close sector
                </Button>
              </div>
              <form onSubmit={addLine} className="grid gap-2 sm:grid-cols-4">
                <Input
                  placeholder="EAN"
                  value={lineForm.ean}
                  onChange={(e) =>
                    setLineForm({ ...lineForm, ean: e.target.value })
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="m²"
                  value={lineForm.quantityM2}
                  onChange={(e) =>
                    setLineForm({ ...lineForm, quantityM2: e.target.value })
                  }
                />
                <Select
                  value={lineForm.locationId}
                  onChange={(e) =>
                    setLineForm({ ...lineForm, locationId: e.target.value })
                  }
                >
                  <option value="">Location in zone</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code}
                    </option>
                  ))}
                </Select>
                <Button type="submit">Add count</Button>
              </form>
            </Card>
          )}
        </>
      )}

      <h2 className="mb-1 font-semibold">
        Count lines {open ? `(session ${open.id})` : ""}
      </h2>
      {open && (
        <p className="mb-3 text-xs text-zinc-500">
          Edit or delete any line while the session is open. Portal scans appear here automatically.
        </p>
      )}
      {lines.length === 0 ? (
        <EmptyState title="No counts yet." />
      ) : (
        <div className="mb-8">{renderCountLines(lines, !!open, openZoneOptions)}</div>
      )}

      {(reportId || latestReport) && (
        <>
          <h2 className="mb-2 font-semibold">Variance report</h2>
          <Card className="mb-4 p-4 text-sm text-zinc-600">
            {reportId === latestReport?.id || !reportId ? (
              <>
                Latest report #{latestReport?.id} ·{" "}
                {latestReport?.totalLines ?? 0} lines · total |Δ|{" "}
                {formatM2(latestReport?.totalVarianceM2 ?? 0)} m²
              </>
            ) : (
              <>Report #{reportId}</>
            )}
            {latestReport && reportId !== latestReport.id && (
              <Button
                className="ml-3"
                variant="secondary"
                onClick={() => setReportId(latestReport.id)}
              >
                View latest
              </Button>
            )}
          </Card>
          {varianceLines.length === 0 ? (
            <EmptyState title="No variance lines." />
          ) : (
            <div className="space-y-2">
              {varianceLines.map((line, idx) => (
                <Card key={idx} className="p-3 text-sm">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      {line.zone ? `${line.zone} · ` : ""}
                      {line.ean} {line.locationCode ? `@ ${line.locationCode}` : ""}
                    </span>
                    <span>Book {formatM2(line.bookM2)} m²</span>
                    <span>Counted {formatM2(line.countedM2)} m²</span>
                    <span
                      className={
                        line.differenceM2 !== 0
                          ? "font-medium text-amber-800"
                          : ""
                      }
                    >
                      Δ {formatM2(line.differenceM2)} m²
                    </span>
                    {line.changeSinceLastM2 != null && (
                      <span className="text-zinc-500">
                        vs last {formatM2(line.changeSinceLastM2)} m²
                      </span>
                    )}
                  </div>
                  {line.productName && (
                    <p className="mt-1 text-xs text-zinc-500">{line.productName}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <h2 className="mb-2 mt-8 font-semibold">Past sessions</h2>
      <p className="mb-3 text-xs text-zinc-500">
        View, rename, edit count lines, or permanently delete closed and cancelled sessions.
      </p>
      {pastSessions.length === 0 ? (
        <EmptyState title="No past sessions." />
      ) : (
        <div className="mb-6 space-y-2">
          {pastSessions.map((s) => (
            <Card key={s.id} className="p-3 text-sm">
              {editingPastSessionId === s.id ? (
                <div className="space-y-2">
                  <Input
                    value={pastEditForm.name}
                    onChange={(e) =>
                      setPastEditForm({ ...pastEditForm, name: e.target.value })
                    }
                    placeholder="Session name"
                  />
                  <Input
                    value={pastEditForm.notes}
                    onChange={(e) =>
                      setPastEditForm({
                        ...pastEditForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Notes"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => savePastSessionEdit(s.id)}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingPastSessionId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {s.name}{" "}
                      <Badge
                        tone={
                          s.status === "closed"
                            ? "green"
                            : s.status === "cancelled"
                              ? "slate"
                              : "amber"
                        }
                      >
                        {s.status}
                      </Badge>
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      #{s.id} · {s.startedAt.slice(0, 10)}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => loadPastSession(s)}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingPastSessionId(s.id);
                        setPastEditForm({
                          name: s.name,
                          notes: s.notes ?? "",
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deletePastSession(s)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {viewedPastSession && (
        <Card className="mb-8 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                {viewedPastSession.name} (session {viewedPastSession.id})
              </h2>
              <p className="text-xs text-zinc-500">
                {viewedPastSession.status} · {viewedPastSession.startedAt.slice(0, 10)}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setViewedPastSession(null);
                setPastLines([]);
                setPastZones([]);
              }}
            >
              Close view
            </Button>
          </div>
          {viewedPastSession.status === "closed" && (
            <p className="mb-3 text-xs text-amber-700">
              This session was finalized — editing lines updates the record only; stock is not recalculated.
            </p>
          )}
          {renderCountLines(pastLines, true, pastZoneOptions)}
        </Card>
      )}
    </AppShell>
  );
}
