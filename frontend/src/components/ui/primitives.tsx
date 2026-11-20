import { cn } from "@/lib/format";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", className)} {...p} />;
}

export function Badge({ tone = "slate", children, className }: { tone?: "slate" | "blue" | "green" | "amber" | "red" | "violet"; children: ReactNode; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Button({ className, variant = "default", ...p }: ComponentProps<"button"> & { variant?: "default" | "ghost" | "primary" }) {
  const v = {
    default: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    primary: "bg-blue-700 text-white hover:bg-blue-800",
  };
  return (
    <button
      className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40", v[variant], className)}
      {...p}
    />
  );
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100", className)}
      {...p}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-200/70", className)} />;
}

export function StatCard({ label, value, hint, accent = "blue" }: { label: string; value: ReactNode; hint?: ReactNode; accent?: "blue" | "green" | "violet" | "amber" }) {
  const bar = { blue: "bg-blue-600", green: "bg-emerald-500", violet: "bg-violet-500", amber: "bg-amber-500" }[accent];
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-1", bar)} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function BarList({ items, max, onClick, color = "bg-blue-600" }: {
  items: { key: string | number; label: string; value: number; sub?: number | null }[];
  max?: number;
  onClick?: (key: string | number) => void;
  color?: string;
}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            disabled={!onClick}
            onClick={() => onClick?.(i.key)}
            className="group w-full text-left disabled:cursor-default"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700 group-enabled:group-hover:text-blue-700" title={i.label}>{i.label}</span>
              <span className="shrink-0 tabular-nums font-medium text-slate-900">{i.value.toLocaleString("es-BO")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${(i.value / m) * 100}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
