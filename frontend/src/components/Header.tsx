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
    <header className="sticky top-0 z-40 border-b border-blue-900/20 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white shadow">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-sm font-bold ring-1 ring-white/20">{APP_INITIALS}</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{APP_NAME}</span>
            <span className="block text-[11px] text-blue-200">Búsqueda centralizada de estudiantes</span>
          </span>
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={cn("rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10")}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
