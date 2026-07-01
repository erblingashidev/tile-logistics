/** Reporting week is anchored on Wednesday (ISO date YYYY-MM-DD). */

export function formatReportWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const daysSinceWednesday = (day + 7 - 3) % 7;
  d.setDate(d.getDate() - daysSinceWednesday);
  return d.toISOString().slice(0, 10);
}

export function isWednesday(date = new Date()): boolean {
  return date.getDay() === 3;
}

export function wednesdayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function previousReportWeeks(count: number, from = new Date()): string[] {
  const weeks: string[] = [];
  const start = new Date(`${formatReportWeek(from)}T12:00:00`);
  for (let i = 0; i < count; i++) {
    weeks.push(start.toISOString().slice(0, 10));
    start.setDate(start.getDate() - 7);
  }
  return weeks;
}
