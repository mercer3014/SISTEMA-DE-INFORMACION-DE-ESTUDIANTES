"use client";

import { CaretDown, CaretUp, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge, CopyButton, Skeleton } from "@/components/ui/primitives";
import { api, type DetalleResponse } from "@/lib/api";
import { cn, edad, fmtFecha, titleCase } from "@/lib/format";

export function StudentDrawer({
  registro,
  registrosVisibles = [],
  onSelectRegistro,
  onClose,
}: {
  registro: string | null;
  registrosVisibles?: string[];
  onSelectRegistro?: (r: string) => void;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<{ registro: string; data?: DetalleResponse; error?: string } | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!registro) return;
    const ctrl = new AbortController();
    api<DetalleResponse>(`/api/estudiantes/${registro}`, undefined, ctrl.signal)
      .then((data) => setEstado({ registro, data }))
      .catch((e) => {
        if (e.name !== "AbortError") setEstado({ registro, error: e.message });
      });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      ctrl.abort();
      window.removeEventListener("keydown", esc);
    };
  }, [registro, onClose]);

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

  const idx = registrosVisibles.indexOf(registro);
  const prevReg = idx > 0 ? registrosVisibles[idx - 1] : null;
  const nextReg = idx >= 0 && idx < registrosVisibles.length - 1 ? registrosVisibles[idx + 1] : null;
  const enlaceActual = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="detalle-titulo">
      <div className="absolute inset-0 bg-[#111827]/35" onClick={onClose} aria-hidden />
      <aside className="h-viewport relative flex w-full flex-col overflow-hidden border-l border-[#E4E6EA] bg-white sm:max-w-xl">
        {/* Cabecera plana sin degradado */}
        <div className="pt-safe shrink-0 border-b border-[#E4E6EA] bg-[#F4F5F6]">
          <div className="flex items-start justify-between gap-3 py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-[#5A6370]">
                <span>Reg. {e?.registro || registro}</span>
                {e && e.activo !== null && (
                  <>
                    <span aria-hidden>/</span>
                    <span>{e.activo ? "Activo" : "Inactivo"}</span>
                  </>
                )}
              </div>
              <h2 id="detalle-titulo" className="mt-1 break-words text-lg font-semibold leading-snug text-[#111827] sm:text-xl">
                {e ? e.nombre_completo : error ? "Estudiante" : <Skeleton className="h-6 w-56 max-w-full" />}
              </h2>
              {e && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {e.en_web && <Badge tone="accent">Datos web</Badge>}
                  {e.en_padron ? (
                    <Badge tone="neutral">Lista PDF</Badge>
                  ) : (
                    e.en_web && <Badge tone="accent">Nuevo en web</Badge>
                  )}
                  {e.activo === true && <Badge tone="neutral">Activo</Badge>}
                  {e.activo === false && <Badge tone="muted">Inactivo</Badge>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onSelectRegistro && registrosVisibles.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={!prevReg}
                    onClick={() => prevReg && onSelectRegistro(prevReg)}
                    aria-label="Estudiante anterior"
                    title="Estudiante anterior"
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-md border border-[#E4E6EA] bg-white text-[#4B5563] transition hover:bg-[#ECEEF0] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretUp size={16} weight="bold" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={!nextReg}
                    onClick={() => nextReg && onSelectRegistro(nextReg)}
                    aria-label="Siguiente estudiante"
                    title="Siguiente estudiante"
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-md border border-[#E4E6EA] bg-white text-[#4B5563] transition hover:bg-[#ECEEF0] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretDown size={16} weight="bold" aria-hidden />
                  </button>
                </>
              )}
              <button
                ref={cerrarRef}
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-md border border-[#E4E6EA] bg-white text-[#4B5563] transition hover:bg-[#ECEEF0] hover:text-[#111827]"
                aria-label="Cerrar ficha"
                title="Cerrar"
              >
                <X size={18} weight="bold" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {error && <p className="p-5 text-sm text-[#991B1B] sm:p-6">{error}</p>}
          {!e && !error && (
            <div className="space-y-3 p-5 sm:p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}

          {e && (
            <div className="pb-safe space-y-6 px-4 pt-5 sm:px-6 sm:pt-6">
              <Section titulo="Datos personales">
                <CampoCopiable
                  k="Registro"
                  mostrar={e.registro || registro}
                  valorCopiar={e.registro || registro}
                  labelCopiar="Copiar registro"
                  mono
                />
                <CampoCopiable
                  k="Carnet (CI)"
                  mostrar={e.ci ? `${e.ci}${e.lugar_ci ? " " + e.lugar_ci : ""}` : null}
                  valorCopiar={e.ci}
                  labelCopiar="Copiar CI"
                  mono
                />
                <Campo k="Nombres" v={e.nombres} />
                <Campo k="Apellidos" v={[e.apellido_pri, e.apellido_seg].filter(Boolean).join(" ") || null} />
                <Campo k="Género" v={e.sexo === "M" ? "Masculino" : e.sexo === "F" ? "Femenino" : null} />
                <Campo k="Nacimiento" v={e.fecha_nac ? `${fmtFecha(e.fecha_nac)} (${edad(e.fecha_nac)} años)` : null} />
                <CampoCopiable k="Teléfono" mostrar={e.telefono} valorCopiar={e.telefono} labelCopiar="Copiar teléfono" mono />
                <CampoCopiable k="Celular" mostrar={e.celular} valorCopiar={e.celular} labelCopiar="Copiar celular" mono />
                <Campo k="Dirección" v={e.direccion} full />
              </Section>

              <Section titulo="Datos académicos">
                <Campo k="Facultad" v={titleCase(e.facultad)} full />
                <Campo k="Carrera" v={titleCase(e.carrera)} />
                <Campo k="Código carrera / plan" v={e.carrera_codigo ? `${e.carrera_codigo} / ${e.plan ?? "—"}` : null} mono />
                <Campo k="Gestión de ingreso" v={e.gestion_ingreso?.toString() ?? null} mono />
                <Campo k="Sede" v={titleCase(e.sede)} />
              </Section>

              {data && (e.mesa || data.padron.length > 0) && (
                <Section titulo="Lista PDF">
                  <Campo k="Mesa" v={e.mesa?.toString() ?? null} mono />
                  <Campo k="Recinto" v={[e.recinto, e.recinto_lugar, e.aula].filter(Boolean).join(" · ") || null} />
                  <Campo
                    k="Habilitado CI / ICU-FAC / FUL"
                    v={[e.hab_ci, e.hab_icu_fac, e.hab_ful].map((b) => (b === null ? "—" : b ? "SI" : "NO")).join(" / ")}
                    mono
                    full
                  />
                  {data.padron.length > 1 && (
                    <div className="col-span-full text-xs text-[#5A6370]">
                      Aparece {data.padron.length} veces en la lista PDF: {data.padron.map((p) => titleCase(p.carrera)).join(", ")}
                    </div>
                  )}
                </Section>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E4E6EA] bg-[#F4F5F6] p-3.5 text-xs leading-relaxed text-[#5A6370]">
                <div>
                  <p>
                    Actualizado desde la fuente web: {fmtFecha(e.web_actualizado_at, true)} · consultas registradas:{" "}
                    {data?.consultas_web}
                  </p>
                  <p className="mt-0.5">Cargado desde la lista PDF: {fmtFecha(e.padron_actualizado_at, true)}</p>
                </div>
                {enlaceActual && <CopyButton value={enlaceActual} label="Copiar enlace de la ficha" text="Copiar enlace" />}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-[#EFEFF2] pb-1.5 text-xs font-semibold text-[#4B5563]">{titulo}</h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3.5 min-[400px]:grid-cols-2">{children}</dl>
    </section>
  );
}

function Campo({ k, v, mono, full }: { k: string; v: string | null | undefined; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "col-span-full min-w-0" : "min-w-0"}>
      <dt className="text-xs text-[#5A6370]">{k}</dt>
      <dd className={cn("mt-0.5 break-words text-[15px] text-[#111827] sm:text-sm", mono && "font-mono")}>
        {v || <span className="text-[#9CA3AF]">—</span>}
      </dd>
    </div>
  );
}

function CampoCopiable({
  k,
  mostrar,
  valorCopiar,
  labelCopiar,
  mono,
}: {
  k: string;
  mostrar: string | null | undefined;
  valorCopiar: string | null | undefined;
  labelCopiar: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#5A6370]">{k}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] text-[#111827] sm:text-sm">
        {mostrar ? (
          <>
            <span className={cn("select-all break-all", mono && "font-mono")}>{mostrar}</span>
            {valorCopiar && <CopyButton value={valorCopiar} label={labelCopiar} text="Copiar" />}
          </>
        ) : (
          <span className="text-[#9CA3AF]">—</span>
        )}
      </dd>
    </div>
  );
}
