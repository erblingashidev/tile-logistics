export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded border border-zinc-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    secondary: "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-zinc-600 hover:bg-zinc-100",
  };
  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded font-medium transition disabled:opacity-50 ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  hint,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-zinc-600">
          {label}
        </span>
      )}
      <input
        className={`w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 ${className}`}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-zinc-600">
          {label}
        </span>
      )}
      <select
        className={`w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "blue" | "red";
}) {
  const tones = {
    slate: "bg-zinc-100 text-zinc-700",
    green: "bg-green-100 text-green-800 ring-1 ring-green-200",
    amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
    blue: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
    red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warning" | "info";
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700",
  };
  return (
    <div className={`rounded border px-3 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <p className="py-10 text-center text-sm text-zinc-500">{title}</p>
  );
}

export function PageSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-6 ${className}`}>
      {title && (
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
    </div>
  );
}

export const tableClass =
  "min-w-full text-sm [&_th]:border-b [&_th]:border-zinc-200 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-zinc-500 [&_td]:border-b [&_td]:border-zinc-100 [&_td]:px-3 [&_td]:py-2.5 [&_tbody_tr:last-child_td]:border-0";
