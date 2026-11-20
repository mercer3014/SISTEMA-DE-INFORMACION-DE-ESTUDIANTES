"use client";

import { ArrowClockwise } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Card, KpiStrip, Skeleton } from "@/components/ui/primitives";
import { api, type Progreso } from "@/lib/api";
import { fmtFecha, fmtNum } from "@/lib/format";

const LABEL_OBJETIVO: Record<string, { label: string; tone: "accent" | "neutral" | "muted" | "danger" }> = {
  encontrado: { label: "Encontrados", tone: "accent" },
  no_encontrado: { label: "No existentes", tone: "neutral" },
  pendiente: { label: "Pendientes", tone: "muted" },
  en_proceso: { label: "En proceso", tone: "neutral" },
  error: { label: "Con error", tone: "danger" },
};

const LABEL_BLOQUE: Record<string, string> = {
  expandido: "Expandidos (densos)",
  muestreado: "En muestreo",
  pendiente: "Pendientes",
  descartado: "Descartados (vacíos)",
};

const LABEL_CORRIDA: Record<string, { label: string; tone: "accent" | "neutral" | "muted" | "danger" }> = {
  corriendo: { label: "En curso", tone: "accent" },
  finalizado: { label: "Finalizada", tone: "neutral" },
  interrumpido: { label: "Interrumpida", tone: "muted" },
  error: { label: "Con error", tone: "danger" },
};

export function ScrapingView() {
  const [p, setP] = useState<Progreso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const load = useCallback(() => {
    setActualizando(true);
    api<Progreso>("/api/scraping/progreso")
      .then((x) => {
        setP(x);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setActualizando(false));
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  if (error && !p) return <Card className="p-10 text-center text-sm text-[#991B1B]">{error}</Card>;
  if (!p) return <Skeleton className="h-64" />;

  const o = Object.fromEntries(p.objetivos.map((x) => [x.estado, x.total]));
  const total = p.objetivos.reduce((a, b) => a + b.total, 0);
  const hechos = (o.encontrado ?? 0) + (o.no_encontrado ?? 0);
  const pend = (o.pendiente ?? 0) + (o.en_proceso ?? 0) + (o.error ?? 0);
  const pct = total ? (hechos / total) * 100 : 0;
  const eta = p.req_por_segundo > 0 ? pend / p.req_por_segundo / 3600 : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <KpiStrip
        items={[
          { label: "Consultados", value: fmtNum(hechos), hint: `de ${fmtNum(total)} candidatos en cola` },
          { label: "Encontrados", value: fmtNum(o.encontrado ?? 0), hint: `${fmtNum(o.no_encontrado ?? 0)} no existen`, accent: true },
          { label: "Ritmo actual", value: `${p.req_por_segundo.toFixed(2)}/s`, hint: `${fmtNum(p.consultas_ultimos_10_min)} consultas en 10 min` },
          {
            label: "Tiempo restante aprox.",
            value: eta === null ? "—" : eta > 48 ? `${(eta / 24).toFixed(1)} días` : `${eta.toFixed(1)} h`,
            hint: "La cola crece al descubrir rangos",
          },
        ]}
      />

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#111827]">Progreso de la cola</h2>
            <p className="mt-0.5 text-xs text-[#5A6370]">Última consulta: {fmtFecha(p.ultima_consulta, true)} (hora de Bolivia)</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="accent" className="font-mono tabular-nums">
              {pct.toFixed(2)} %
            </Badge>
            <Button onClick={load} disabled={actualizando} className="h-8 min-h-8 px-2.5 text-xs">
              <ArrowClockwise size={14} className={actualizando ? "animate-spin" : undefined} aria-hidden />
              <span>Actualizar</span>
            </Button>
          </div>
        </div>

        {/* Barra sólida sin degradado */}
        <div className="h-2.5 overflow-hidden rounded-sm bg-[#ECEEF0]">
          <div className="h-full bg-[#166534] transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {p.objetivos.map((x) => {
            const meta = LABEL_OBJETIVO[x.estado] ?? { label: x.estado, tone: "neutral" as const };
            return (
              <Badge key={x.estado} tone={meta.tone}>
                <span>{meta.label}:</span>
                <span className="font-mono tabular-nums">{fmtNum(x.total)}</span>
              </Badge>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[#111827]">Bloques de numeración</h2>
          <p className="mt-1 text-xs text-[#5A6370]">
            Cada bloque agrupa 100 secuencias de una gestión. Se expanden los densos, se muestrean los dudosos y se descartan los vacíos.
          </p>
          <dl className="mt-3 divide-y divide-[#EFEFF2] text-sm">
            {p.bloques.map((b) => (
              <div key={b.estado} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[#4B5563]">{LABEL_BLOQUE[b.estado] ?? b.estado}</dt>
                <dd className="font-mono font-medium tabular-nums text-[#111827]">{fmtNum(b.total)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-[#111827]">Últimas corridas</h2>
          <ul className="divide-y divide-[#EFEFF2] text-sm">
            {p.corridas.map((c) => {
              const meta = LABEL_CORRIDA[c.estado] ?? { label: c.estado, tone: "neutral" as const };
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="text-[#111827]">
                    <span className="font-mono font-medium">#{c.id}</span> · {c.modo}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-[#5A6370]">
                    <span>{fmtFecha(c.iniciado_en, true)}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
