"use client";

/** Inner page chrome when CashierAppShell is provided by the admin layout. */
export function CashierPageFrame({
  children,
  title,
  description,
  contentMaxWidth = "default",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  contentMaxWidth?: "default" | "wide" | "full";
}) {
  const mainMaxWidthClass =
    contentMaxWidth === "full"
      ? "max-w-none"
      : contentMaxWidth === "wide"
        ? "max-w-[min(100%,1680px)]"
        : "max-w-7xl";

  return (
    <div className={`mx-auto w-full ${mainMaxWidthClass}`}>
      {title ? (
        <div className="mb-5">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
