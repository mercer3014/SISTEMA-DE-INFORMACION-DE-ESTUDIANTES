"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/format";

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-[#E4E6EA] bg-white", className)} {...p} />;
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "muted" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-[#F4F5F6] text-[#4B5563] ring-[#E4E6EA]",
    accent: "bg-[#F0F7F2] text-[#166534] ring-[#C4DEC9]",
    muted: "bg-white text-[#5A6370] ring-[#E4E6EA]",
    danger: "bg-[#FEF2F2] text-[#991B1B] ring-[#FECACA]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  className,
  variant = "default",
  type = "button",
  ...p
}: ComponentProps<"button"> & { variant?: "default" | "ghost" | "primary" }) {
  const v = {
    default: "border border-[#E4E6EA] bg-white text-[#111827] hover:bg-[#F4F5F6]",
    ghost: "text-[#4B5563] hover:bg-[#F4F5F6] hover:text-[#111827]",
    primary: "bg-[#166534] text-white hover:bg-[#14532D]",
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9 sm:min-w-9",
        v[variant],
        className,
      )}
      {...p}
    />
  );
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "select-chevron h-10 min-w-0 appearance-none rounded-md border border-[#E4E6EA] bg-white pl-2.5 pr-8 text-base text-[#111827] outline-none transition focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/15 sm:h-9 sm:text-sm",
        /(^|\s)w-/.test(className ?? "") ? "" : "w-full",
        className,
      )}
      {...p}
    />
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[#4B5563]">
      {children}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[#ECEEF0]", className)} />;
}

export function KpiStrip({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }[];
}) {
  return (
    <Card className="grid grid-cols-1 divide-y divide-[#E4E6EA] overflow-hidden min-[420px]:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="p-4 sm:px-5">
          <p className="text-xs font-medium text-[#5A6370]">{item.label}</p>
          <p
            className={cn(
              "mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-[26px]",
              item.accent ? "text-[#166534]" : "text-[#111827]",
            )}
          >
            {item.value}
          </p>
          {item.hint && <p className="mt-1 text-xs text-[#5A6370]">{item.hint}</p>}
        </div>
      ))}
    </Card>
  );
}

export function BarList({
  items,
  max,
  onClick,
  tone = "accent",
  activeKey = null,
  emptyText = "Sin datos para esta selección",
}: {
  items: { key: string | number; label: string; value: number }[];
  max?: number;
  onClick?: (key: string | number) => void;
  tone?: "accent" | "muted";
  activeKey?: string | number | null;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-[#5A6370]">{emptyText}</p>;
  }
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  const fillClass = tone === "accent" ? "bg-[#166534]" : "bg-[#8A9A8E]";

  return (
    <ul className="space-y-1.5">
      {items.map((i) => {
        const active = activeKey !== null && String(activeKey) === String(i.key);
        return (
          <li key={i.key}>
            <button
              type="button"
              disabled={!onClick}
              onClick={() => onClick?.(i.key)}
              aria-pressed={active ? true : undefined}
              className={cn(
                "group w-full rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-default",
                onClick && "cursor-pointer hover:bg-[#F4F5F6]",
                active && "bg-[#F0F7F2] ring-1 ring-[#C4DEC9]",
              )}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span
                  className={cn(
                    "truncate",
                    active ? "font-semibold text-[#166534]" : "text-[#111827] group-enabled:group-hover:text-[#166534]",
                  )}
                  title={i.label}
                >
                  {i.label}
                </span>
                <span className="shrink-0 font-mono font-medium tabular-nums text-[#4B5563]">
                  {i.value.toLocaleString("es-BO")}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-[#ECEEF0]">
                <div className={cn("h-full rounded-sm transition-all", fillClass)} style={{ width: `${(i.value / m) * 100}%` }} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CopyButton({
  value,
  label,
  text,
  copiedText = "Copiado",
  className,
}: {
  value: string;
  label: string;
  text?: string;
  copiedText?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copiar = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopiado(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? `${label}: ${copiedText}` : label}
      title={copiado ? copiedText : label}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition active:scale-[0.98]",
        copiado
          ? "border-[#C4DEC9] bg-[#F0F7F2] text-[#166534]"
          : "border-[#E4E6EA] bg-[#F4F5F6] text-[#4B5563] hover:bg-[#ECEEF0] hover:text-[#111827]",
        className,
      )}
    >
      {copiado ? (
        <>
          <Check size={14} weight="bold" aria-hidden />
          <span>{copiedText}</span>
        </>
      ) : (
        <>
          <Copy size={14} weight="regular" aria-hidden />
          {text && <span>{text}</span>}
        </>
      )}
    </button>
  );
}
