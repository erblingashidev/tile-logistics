/** Shared chip styles for payment method & settlement pickers. */
export function pickerChipClass(active: boolean, compact?: boolean) {
  const size = compact
    ? "px-2.5 py-1.5 text-xs leading-snug font-semibold"
    : "px-3.5 py-2 text-sm leading-snug font-semibold";
  const state = active
    ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
    : "border-zinc-300 bg-white text-zinc-800 shadow-sm hover:border-zinc-400 hover:bg-zinc-50";
  return `rounded-lg border text-left transition ${size} ${state}`;
}
