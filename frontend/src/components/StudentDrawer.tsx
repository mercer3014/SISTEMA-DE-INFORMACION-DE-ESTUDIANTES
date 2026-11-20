"use client";

import { useEffect, useRef, useState } from "react";

import { Badge, Skeleton } from "@/components/ui/primitives";
import { api, type DetalleResponse } from "@/lib/api";
import { edad, fmtFecha, titleCase } from "@/lib/format";

export function StudentDrawer({ registro, onClose }: { registro: string | null; onClose: () => void }) {
  const [estado, setEstado] = useState<{ registro: string; data?: DetalleResponse; error?: string } | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!registro) return;
    const ctrl = new AbortController();
    api<DetalleResponse>(`/api/estudiantes/${registro}`, undefined, ctrl.signal)
      .then((data) => setEstado({ registro, data }))
      .catch((e) => { if (e.name !== "AbortError") setEstado({ registro, error: e.message }); });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { ctrl.abort(); window.removeEventListener("keydown", esc); };
  }, [registro, onClose]);

  // Bloquea el scroll del fondo y lleva el foco al botón cerrar mientras está abierto.
  const abierto = !!registro;
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    document.documentElement.classList.add("drawer-abierto");
    cerrarRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.classList.remove("drawer-abierto");
      previo?.focus?.({ preventScroll: true });
    };
  }, [abierto]);

  if (!registro) return null;
  const actual = estado?.registro === registro ? estado : null;
  const data = actual?.data ?? null;
  const error = actual?.error ?? null;
  const e = data?.estudiante;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="detalle-titulo">
      <div className="absolute inset-0 bg-slate-900/40 sm:backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside className="h-viewport relative flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-w-xl">
        <div className="pt-safe shrink-0 bg-gradient-to-br from-blue-800 to-blue-950 text-white">
          <div className="flex items-start justify-between gap-3 py-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1 pt-1">
              <h2 id="detalle-titulo" className="break-words text-lg font-semibold leading-snug sm:text-xl">
                {e ? e.nombre_completo : error ? "Estudiante" : <Skeleton className="h-6 w-56 max-w-full bg-white/20" />}
              </h2>
              {e && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.en_web && <Badge tone="green">Datos web</Badge>}
                  {e.en_padron && <Badge tone="slate">Lista PDF</Badge>}
                  {e.activo === true && <Badge tone="blue">Activo</Badge>}
                  {e.activo === false && <Badge tone="amber">Inactivo</Badge>}
                </div>
              )}
            </div>
            <button
              ref={cerrarRef}
              onClick={onClose}
              className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-blue-100 transition hover:bg-white/10 focus-visible:outline-white"
              aria-label="Cerrar"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {error && <p className="p-5 text-rose-700 sm:p-6">{error}</p>}
          {!e && !error && <div className="space-y-3 p-5 sm:p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>}

          {e && (
            <div className="pb-safe space-y-6 px-4 pt-5 sm:px-6 sm:pt-6">
              <Section titulo="Datos personales">
                <CampoRegistro registro={e.registro || registro} />
                <Campo k="Nombres" v={e.nombres} />
                <Campo k="Apellidos" v={[e.apellido_pri, e.apellido_seg].filter(Boolean).join(" ") || null} />
                <Campo k="Carnet (CI)" v={e.ci ? `${e.ci}${e.lugar_ci ? " " + e.lugar_ci : ""}` : null} mono />
                <Campo k="Sexo" v={e.sexo === "M" ? "Masculino" : e.sexo === "F" ? "Femenino" : null} />
                <Campo k="Nacimiento" v={e.fecha_nac ? `${fmtFecha(e.fecha_nac)} (${edad(e.fecha_nac)} años)` : null} />
                <Campo k="Teléfono" v={e.telefono} mono />
                <Campo k="Celular" v={e.celular} mono />
                <Campo k="Dirección" v={e.direccion} full />
              </Section>

              <Section titulo="Datos académicos">
                <Campo k="Facultad" v={titleCase(e.facultad)} full />
                <Campo k="Carrera" v={titleCase(e.carrera)} />
                <Campo k="Código carrera / plan" v={e.carrera_codigo ? `${e.carrera_codigo} / ${e.plan ?? "—"}` : null} mono />
                <Campo k="Gestión de ingreso" v={e.gestion_ingreso?.toString() ?? null} />
                <Campo k="Sede" v={titleCase(e.sede)} />
              </Section>

              {data && (e.mesa || data.padron.length > 0) && (
                <Section titulo="Lista PDF">
                  <Campo k="Mesa" v={e.mesa?.toString() ?? null} />
                  <Campo k="Recinto" v={[e.recinto, e.recinto_lugar, e.aula].filter(Boolean).join(" · ") || null} />
                  <Campo k="Habilitado CI / ICU-FAC / FUL" v={[e.hab_ci, e.hab_icu_fac, e.hab_ful].map((b) => (b === null ? "—" : b ? "SI" : "NO")).join(" / ")} full />
                  {data.padron.length > 1 && (
                    <div className="col-span-full text-xs text-slate-500">Aparece {data.padron.length} veces en la lista PDF: {data.padron.map((p) => titleCase(p.carrera)).join(", ")}</div>
                  )}
                </Section>
              )}

              <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
                <p>Actualizado desde la fuente web: {fmtFecha(e.web_actualizado_at, true)} · consultas registradas: {data?.consultas_web}</p>
                <p className="mt-1">Cargado desde la lista PDF: {fmtFecha(e.padron_actualizado_at, true)}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3.5 rounded-xl border border-slate-200 p-4 min-[400px]:grid-cols-2">{children}</dl>
    </section>
  );
}

function Campo({ k, v, mono, full }: { k: string; v: string | null | undefined; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "col-span-full min-w-0" : "min-w-0"}>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className={`mt-0.5 break-words text-[15px] text-slate-900 sm:text-sm ${mono ? "font-mono" : ""}`}>{v || <span className="text-slate-300">—</span>}</dd>
    </div>
  );
}

/** Registro como un campo más, con valor seleccionable y botón para copiar. */
function CampoRegistro({ registro }: { registro: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(registro);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* portapapeles no disponible: el valor sigue siendo seleccionable */ }
  };
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">Registro</dt>
      <dd className="mt-0.5 flex items-center gap-1 text-[15px] text-slate-900 sm:text-sm">
        <span className="select-all font-mono">{registro}</span>
        <button
          type="button"
          onClick={copiar}
          className="-my-3 grid h-11 min-w-11 place-items-center rounded-md px-1.5 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Copiar registro"
          title="Copiar registro"
        >
          {copiado ? (
            <span className="text-emerald-600">Copiado</span>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          )}
        </button>
      </dd>
    </div>
  );
}
