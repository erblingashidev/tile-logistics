"use client";

import { useEffect, useState } from "react";
import { LOG_ACTION_ICONS } from "@/lib/log-messages";

interface TimelineEntry {
  id: number;
  action: string;
  message: string;
  createdAt: string;
}

export function OrderAssignmentTimeline({ orderId }: { orderId: number }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${orderId}/timeline`)
      .then((r) => r.json())
      .then((data) => setEntries(data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <p className="mt-2 text-xs text-zinc-500">Loading assignment history…</p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="mt-2 text-xs text-zinc-500">No assignment changes logged yet.</p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex gap-2 border-l-2 border-violet-200 pl-3 text-xs text-zinc-600"
        >
          <span className="shrink-0 text-violet-600">
            {LOG_ACTION_ICONS[entry.action] ?? "·"}
          </span>
          <div>
            <p className="text-zinc-800">{entry.message}</p>
            <p className="text-zinc-400">
              {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
