/** Format ISO timestamps for Excel (local-style, no timezone conversion). */
export function formatExportDateTime(value?: string | null): string {
  if (!value?.trim()) return "";
  const normalized = value.trim();
  if (normalized.length >= 16) {
    return normalized.slice(0, 16).replace("T", " ");
  }
  return normalized;
}

export function formatExportDate(value?: string | null): string {
  if (!value?.trim()) return "";
  return value.trim().slice(0, 10);
}

export function daysBetweenDates(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}
