"use client";

import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/primitives";
import { cn, fmtNum } from "@/lib/format";

const UMBRAL_CIERRE_PX = 88;
const VELOCIDAD_CIERRE = 0.55;
const MIN_ARRASTRE_PX = 28;

function elementosEnfocables(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export function FiltrosMovil({
  open,
  title = "Filtros",
  total,
  cargando,
  onClose,
  onClear,
  onApply,
  children,
}: {
  open: boolean;
  title?: string;
  total: number | null;
  cargando?: boolean;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);

  const setOffsetSync = (v: number) => {
    offsetRef.current = v;
    setOffset(v);
  };

  const cerrar = useCallback(() => {
    draggingRef.current = false;
    offsetRef.current = 0;
    setOffset(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previo = document.activeElement as HTMLElement | null;
    const prevPos = body.style.position;
    const prevTop = body.style.top;
    const prevWidth = body.style.width;

    html.classList.add("filtros-movil-abierto");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 20);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const lista = elementosEnfocables(panelRef.current);
      if (lista.length === 0) return;
      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      html.classList.remove("filtros-movil-abierto");
      body.style.position = prevPos;
      body.style.top = prevTop;
      body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
      previo?.focus?.({ preventScroll: true });
    };
  }, [open, cerrar]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    lastTRef.current = performance.now();
    velRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    const y = e.clientY;
    const now = performance.now();
    const dt = now - lastTRef.current;
    if (dt > 0) velRef.current = (y - lastYRef.current) / dt;
    lastYRef.current = y;
    lastTRef.current = now;
    setOffsetSync(Math.max(0, y - startYRef.current));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dy = offsetRef.current;
    const vy = velRef.current;
    if (dy >= UMBRAL_CIERRE_PX || (vy > VELOCIDAD_CIERRE && dy > MIN_ARRASTRE_PX)) {
      cerrar();
    } else {
      setOffsetSync(0);
    }
  }, [cerrar]);

  const etiquetaResultados =
    total === null
      ? "Aplicar"
      : `Ver ${fmtNum(total)} resultado${total === 1 ? "" : "s"}`;

  const arrastrando = offset > 0;

  return (
    <div className={cn("lg:hidden", open ? "visible" : "invisible pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-[#111827]/40 transition-opacity duration-300 motion-reduce:transition-none",
          open && !arrastrando ? "opacity-100" : "opacity-0",
        )}
        style={open && arrastrando ? { opacity: Math.max(0.08, 1 - offset / 420) } : undefined}
        onClick={cerrar}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={cargando ? true : undefined}
        inert={!open ? true : undefined}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex h-[92dvh] flex-col rounded-t-2xl bg-white shadow-[0_-8px_32px_rgba(17,24,39,0.18)]",
          !arrastrando && "transition-transform duration-300 ease-out motion-reduce:transition-none",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={open && offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
      >
        <div
          className="touch-none shrink-0 cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-[#D1D5DB]" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-[#111827]">
              {title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={cerrar}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Cerrar filtros"
              className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-md text-[#5A6370] hover:bg-[#F4F5F6] hover:text-[#111827]"
            >
              <X size={18} weight="bold" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          <div className="space-y-4">{children}</div>
        </div>

        <div className="pb-safe grid shrink-0 grid-cols-[1fr_1.45fr] gap-2 border-t border-[#E4E6EA] bg-white p-3">
          <Button onClick={onClear} className="h-11 w-full">
            Limpiar
          </Button>
          <Button
            variant="primary"
            onClick={onApply}
            className="h-11 w-full px-2 whitespace-nowrap text-[13px] sm:text-sm"
          >
            {etiquetaResultados}
          </Button>
        </div>
      </div>
    </div>
  );
}
