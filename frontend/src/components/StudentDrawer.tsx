"use client";

import { useEffect, useState } from "react";

import { Badge, Skeleton } from "@/components/ui/primitives";
import { api, type DetalleResponse } from "@/lib/api";
import { edad, fmtFecha, titleCase } from "@/lib/format";

export function StudentDrawer({ registro, onClose }: { registro: string | null; onClose: () => void }) {
  const [estado, setEstado] = useState<{ registro: string; data?: DetalleResponse; error?: string } | null>(null);

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

  if (!registro) return null;
  const actual = estado?.registro === registro ? estado : null;
  const data = actual?.data ?? null;
  const error = actual?.error ?? null;
  const e = data?.estudiante;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-gradient-to-br from-blue-800 to-blue-950 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-blue-200">Registro {registro}</p>
              <h2 className="mt-1 text-xl font-semibold leading-tight">{e ? e.nombre_completo : <Skeleton className="h-6 w-64 bg-white/20" />}</h2>
              {e && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.en_web && <Badge tone="green">Datos web</Badge>}
                  {e.en_padron && <Badge tone="slate">Lista PDF</Badge>}
                  {e.activo === true && <Badge tone="blue">Activo</Badge>}
                  {e.activo === false && <Badge tone="amber">Inactivo</Badge>}
                </div>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-blue-100 hover:bg-white/10" aria-label="Cerrar">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>

        {error && <p className="p-6 text-rose-700">{error}</p>}
        {!e && !error && <div className="space-y-3 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>}

        {e && (
          <div className="space-y-6 p-6">
            <Section titulo="Datos personales">
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
                <Campo k="Habilitado CI / ICU-FAC / FUL" v={[e.hab_ci, e.hab_icu_fac, e.hab_ful].map((b) => (b === null ? "—" : b ? "SI" : "NO")).join(" / ")} />
                {data.padron.length > 1 && (
                  <div className="col-span-2 text-xs text-slate-500">Aparece {data.padron.length} veces en la lista PDF: {data.padron.map((p) => titleCase(p.carrera)).join(", ")}</div>
                )}
              </Section>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
              <p>Actualizado desde la fuente web: {fmtFecha(e.web_actualizado_at, true)} · consultas registradas: {data?.consultas_web}</p>
              <p className="mt-1">Cargado desde la lista PDF: {fmtFecha(e.padron_actualizado_at, true)}</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{titulo}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 p-4">{children}</dl>
    </section>
  );
}

function Campo({ k, v, mono, full }: { k: string; v: string | null | undefined; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className={`mt-0.5 text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{v || <span className="text-slate-300">—</span>}</dd>
    </div>
  );
}
