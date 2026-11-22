"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_NAME } from "@/lib/app";
import { cn } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Búsqueda" },
  { href: "/estadisticas", label: "Estadísticas" },
  { href: "/scraping", label: "Recolección" },
];

export function Header() {
  const path = usePathname();
  return (
    <header data-testid="encabezado" className="pt-safe sticky top-0 z-40 border-b border-[#E4E6EA] bg-white">
      <div className="px-safe mx-auto flex max-w-[1920px] flex-col gap-1 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center justify-between gap-4 py-2 sm:h-full sm:py-0">
          <Link href="/" className="flex min-h-10 items-center rounded-md pr-1">
            <span className="text-base font-semibold tracking-tight text-[#111827]">{APP_NAME}</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-between gap-4 sm:h-full">
          <nav
            data-testid="secciones"
            aria-label="Secciones"
            className="no-scrollbar -mx-1 flex flex-1 items-stretch gap-1 overflow-x-auto px-1 sm:mx-0 sm:h-full sm:flex-none sm:px-0"
          >
            {LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors sm:h-full sm:flex-none",
                    active
                      ? "border-[#166534] font-semibold text-[#111827]"
                      : "border-transparent font-medium text-[#5A6370] hover:text-[#111827]",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 text-xs text-[#5A6370] md:flex">
            <span className="rounded border border-[#E4E6EA] bg-[#F4F5F6] px-2 py-0.5 font-mono text-[11px]">
              / buscar
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
