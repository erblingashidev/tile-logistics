"use client";

import { useState } from "react";

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded border border-zinc-200 bg-white ${
        interactive
          ? "transition hover:border-zinc-300 hover:shadow-sm"
          : ""
      } ${className}`}
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
    md: "min-h-10 px-3.5 py-2 text-sm",
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

export function Textarea({
  label,
  hint,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
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
      <textarea
        className={`w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 ${className}`}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function ResponsiveTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto overscroll-x-contain rounded border border-zinc-200 bg-white ${className}`}
    >
      <div className="min-w-[640px]">{children}</div>
    </div>
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

export function LoadingState({ title = "Loading…" }: { title?: string }) {
  return (
    <p className="py-10 text-center text-sm text-zinc-500 animate-pulse">
      {title}
    </p>
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
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function StatLink({
  label,
  value,
  href,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  href: string;
  hint?: string;
  accent?: "default" | "amber" | "blue";
}) {
  const accents = {
    default: "hover:border-zinc-400",
    amber: "border-amber-200 bg-amber-50/40 hover:border-amber-300",
    blue: "border-blue-200 bg-blue-50/40 hover:border-blue-300",
  };
  return (
    <a
      href={href}
      className={`block rounded border border-zinc-200 bg-white px-4 py-3 transition hover:shadow-sm ${accents[accent ?? "default"]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </a>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  size?: "sm" | "md";
}) {
  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-lg bg-zinc-100/80 p-1 ring-1 ring-zinc-200/80"
      role="tablist"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-md font-medium transition ${sizes[size]} ${
              selected
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-600 hover:bg-white hover:text-zinc-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CollapsibleCard({
  title,
  subtitle,
  badge,
  headerTone = "default",
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerTone?: "default" | "amber" | "muted";
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (open: boolean) => {
    setInternalExpanded(open);
    onExpandedChange?.(open);
  };

  const headerTones = {
    default: "border-zinc-200 bg-zinc-50/80 hover:bg-zinc-100/80",
    amber: "border-amber-200/80 bg-amber-50/80 hover:bg-amber-100/60",
    muted: "border-zinc-200 bg-white hover:bg-zinc-50",
  };

  return (
    <Card className={`overflow-hidden p-0 ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between gap-3 border-b px-5 py-4 text-left transition ${headerTones[headerTone]}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-zinc-900">{title}</p>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-sm text-zinc-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▼
        </span>
      </button>
      {expanded ? <div className="space-y-4 p-5">{children}</div> : null}
    </Card>
  );
}

export const tableClass =
  "min-w-full text-sm [&_th]:border-b [&_th]:border-zinc-200 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-zinc-500 [&_td]:border-b [&_td]:border-zinc-100 [&_td]:px-3 [&_td]:py-2.5 [&_tbody_tr:last-child_td]:border-0";
