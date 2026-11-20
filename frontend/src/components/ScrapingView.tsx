"use client";

import { useEffect, useState } from "react";

import { Badge, Card, Skeleton, StatCard } from "@/components/ui/primitives";
import { api, type Progreso } from "@/lib/api";
import { fmtFecha, fmtNum } from "@/lib/format";

export function ScrapingView() {
  const [p, setP] = useState<Progreso | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api<Progreso>("/api/scraping/progreso").then((x) => { setP(x); setError(null); }).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (error) return <Card className="p-10 text-center text-rose-700">{error}</Card>;
  if (!p) return <Skeleton className="h-64" />;

  const o = Object.fromEntries(p.objetivos.map((x) => [x.estado, x.total]));
  const total = p.objetivos.reduce((a, b) => a + b.total, 0);
  const hechos = (o.encontrado ?? 0) + (o.no_encontrado ?? 0);
  const pend = (o.pendiente ?? 0) + (o.en_proceso ?? 0) + (o.error ?? 0);
  const pct = total ? (hechos / total) * 100 : 0;
  const eta = p.req_por_segundo > 0 ? pend / p.req_por_segundo / 3600 : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Consultados" value={fmtNum(hechos)} hint={`de ${fmtNum(total)} candidatos en cola`} />
        <StatCard label="Encontrados" value={fmtNum(o.encontrado ?? 0)} hint={`${fmtNum(o.no_encontrado ?? 0)} no existen`} accent="green" />
        <StatCard label="Velocidad" value={`${p.req_por_segundo.toFixed(2)}/s`} hint={`${fmtNum(p.consultas_ultimos_10_min)} consultas en 10 min`} accent="violet" />
        <StatCard label="Tiempo restante (aprox.)" value={eta === null ? "—" : eta > 48 ? `${(eta / 24).toFixed(1)} días` : `${eta.toFixed(1)} h`} hint="La cola puede crecer al descubrir rangos" accent="amber" />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex justify-between text-sm"><span className="font-medium text-slate-900">Progreso</span><span className="tabular-nums text-slate-600">{pct.toFixed(2)} %</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500" style={{ width: `${pct}%` }} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {p.objetivos.map((x) => <Badge key={x.estado} tone={x.estado === "encontrado" ? "green" : x.estado === "error" ? "red" : x.estado === "pendiente" ? "slate" : "blue"}>{x.estado}: {fmtNum(x.total)}</Badge>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">Última consulta: {fmtFecha(p.ultima_consulta, true)} (hora de Bolivia)</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Bloques de numeración</h2>
          <p className="mb-3 text-xs text-slate-500">Cada bloque = 100 secuencias de una gestión. Se expanden los densos, se muestrean los dudosos y se descartan los vacíos.</p>
          <div className="flex flex-wrap gap-2">{p.bloques.map((b) => <Badge key={b.estado} tone="violet">{b.estado}: {fmtNum(b.total)}</Badge>)}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Últimas corridas</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {p.corridas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <span className="text-slate-700">#{c.id} · {c.modo}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">{fmtFecha(c.iniciado_en, true)} <Badge tone={c.estado === "corriendo" ? "blue" : c.estado === "finalizado" ? "green" : "amber"}>{c.estado}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
