export type DeliveryLinkInfo = {
  id: number;
  invoiceNumber: string;
  customerName: string;
  assignment?: {
    vehicleId?: number;
    vehicleName: string;
    deliveryRound: number;
  } | null;
};

function partnerLine(link: DeliveryLinkInfo) {
  const truck = link.assignment
    ? `${link.assignment.vehicleName} · R${link.assignment.deliveryRound}`
    : "Unassigned";
  return `${link.invoiceNumber} · ${truck}`;
}

export function hasDeliveryLinks(
  links: DeliveryLinkInfo[] | undefined | null
): links is DeliveryLinkInfo[] {
  return Boolean(links && links.length > 0);
}

export function deliveryLinkCardClass(
  links: DeliveryLinkInfo[] | undefined | null
) {
  return hasDeliveryLinks(links)
    ? "border-l-4 border-l-sky-500 ring-1 ring-sky-100"
    : "";
}

export function DeliveryLinkBadge({
  links,
}: {
  links: DeliveryLinkInfo[] | undefined | null;
}) {
  if (!hasDeliveryLinks(links)) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-sky-600 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
      Linked
    </span>
  );
}

export function DeliveryLinkNotice({
  links,
  compact = false,
}: {
  links: DeliveryLinkInfo[] | undefined | null;
  compact?: boolean;
}) {
  if (!hasDeliveryLinks(links)) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 text-sky-950 ${
        compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
      }`}
      role="note"
      aria-label="Linked delivery group"
    >
      <span className={compact ? "text-sm" : "text-base"} aria-hidden>
        🔗
      </span>
      <div className="min-w-0">
        <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
          Linked delivery
        </p>
        <p className={`mt-0.5 text-sky-900 ${compact ? "text-[11px]" : "text-xs"}`}>
          {links.map(partnerLine).join(" · ")}
        </p>
      </div>
    </div>
  );
}
