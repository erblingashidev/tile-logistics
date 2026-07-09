/** Pro-Data watch folders use DD.MM.YYYY, e.g. 09.07.2026 */
export function isDateFolderName(name: string): boolean {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(name.trim());
}

export function folderDateLabelToIso(label: string): string | null {
  const match = label.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function folderDateFromFilePath(filePath: string): string | null {
  const parts = filePath.split(/[/\\]/);
  for (let i = parts.length - 2; i >= 0; i--) {
    const iso = folderDateLabelToIso(parts[i] ?? "");
    if (iso) return iso;
  }
  return null;
}
