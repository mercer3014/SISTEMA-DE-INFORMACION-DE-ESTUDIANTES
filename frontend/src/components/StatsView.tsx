"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BarList, Card, Skeleton, StatCard } from "@/components/ui/primitives";
import { api, type Stats } from "@/lib/api";
import { fmtNum, titleCase } from "@/lib/format";

export function StatsView() {
  const router = useRouter();
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/stats").then(setS).catch((e) => setError(e.message));
  }, []);

  if (error) return <Card className="p-10 text-center text-rose-700">No se pudo cargar: {error}</Card>;
  if (!s) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;

  const r = s.resumen;
  const gest = s.por_gestion.filter((g) => Number(g.etiqueta) >= 2000);
  const maxG = Math.max(1, ...gest.map((g) => g.total));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Estudiantes" value={fmtNum(r.total)} hint={`${r.facultades} facultades · ${r.sedes} sedes`} />
        <StatCard label="Con datos web" value={fmtNum(r.en_web)} hint={`${((r.en_web / Math.max(1, r.total)) * 100).toFixed(1)} % del total · ${fmtNum(r.con_ci)} con CI`} accent="green" />
        <StatCard label="Nuevos (no están en la lista PDF)" value={fmtNum(r.solo_web)} hint="Descubiertos por el scraper" accent="violet" />
        <StatCard label="En la lista PDF" value={fmtNum(r.en_padron)} hint={`H ${fmtNum(r.hombres)} · M ${fmtNum(r.mujeres)} (según datos web)`} accent="amber" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-900">Estudiantes por gestión de ingreso</h2>
          <span className="text-xs text-slate-500">Derivada del registro (2 + AA + secuencia + verificador)</span>
        </div>
        <div className="flex h-56 items-end gap-1.5 overflow-x-auto pb-1">
          {gest.map((g) => (
            <button key={g.etiqueta} onClick={() => router.push(`/?gestion=${g.etiqueta}`)} className="group flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1" title={`${g.etiqueta}: ${fmtNum(g.total)}`}>
              <span className="text-[10px] tabular-nums text-slate-500 opacity-0 group-hover:opacity-100">{fmtNum(g.total)}</span>
              <div className="relative w-full overflow-hidden rounded-t-md bg-blue-200 transition group-hover:bg-blue-300" style={{ height: `${(g.total / maxG) * 180}px` }}>
                <div className="absolute inset-x-0 bottom-0 bg-blue-600" style={{ height: `${((g.con_datos_web ?? 0) / Math.max(1, g.total)) * 100}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-slate-500">{String(g.etiqueta).slice(2)}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> con datos web</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-200" /> total</span>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Por facultad</h2>
          <BarList
            items={s.por_facultad.map((f) => ({ key: f.id ?? 0, label: titleCase(f.etiqueta), value: f.total }))}
            onClick={(k) => router.push(`/?facultad_id=${k}`)}
          />
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Carreras con más estudiantes</h2>
            <BarList
              color="bg-violet-500"
              items={s.por_carrera.slice(0, 12).map((c) => ({ key: c.id ?? 0, label: titleCase(c.etiqueta?.split(" · ")[0]), value: c.total }))}
              onClick={(k) => router.push(`/?carrera_id=${k}`)}
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Por sede</h2>
            <BarList
              color="bg-emerald-500"
              items={s.por_sede.filter((x) => x.total > 0).map((x) => ({ key: x.id ?? 0, label: titleCase(x.etiqueta), value: x.total }))}
              onClick={(k) => router.push(`/?sede_id=${k}`)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
