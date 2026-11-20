"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_INITIALS, APP_NAME } from "@/lib/app";
import { cn } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Búsqueda" },
  { href: "/estadisticas", label: "Estadísticas" },
  { href: "/scraping", label: "Recolección" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="pt-safe sticky top-0 z-40 border-b border-blue-900/20 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white shadow">
      <div className="px-safe mx-auto flex max-w-7xl flex-col gap-2 py-2.5 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <Link href="/" className="flex min-h-11 items-center gap-3 self-start rounded-lg focus-visible:outline-white sm:self-auto">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-bold ring-1 ring-white/20">{APP_INITIALS}</span>
          <span className="leading-tight">
            <span className="block text-base font-semibold sm:text-sm">{APP_NAME}</span>
            <span className="hidden text-[11px] text-blue-200 sm:block">Búsqueda centralizada de estudiantes</span>
          </span>
        </Link>
        <nav aria-label="Secciones" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 flex-1 focus-visible:outline-white items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition sm:flex-none",
                  active ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
