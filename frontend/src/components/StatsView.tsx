"use client";

import { ArrowRight, CaretDown, SlidersHorizontal, X } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacetGroup } from "@/components/ui/FacetGroup";
import { BarList, Button, Card, KpiStrip, Skeleton } from "@/components/ui/primitives";
import { api, type Carrera, type Facultad, type Gestion, type Sede, type Stats } from "@/lib/api";
import { cn, fmtNum, parseList, removeFromList, titleCase, toggleInList } from "@/lib/format";

const STATS_FILTROS = ["gestion", "facultad_id", "carrera_id", "sede_id", "sexo"] as const;

export function StatsView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  const [s, setS] = useState<Stats | null>(null);
  const [resKey, setResKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [openSignal, setOpenSignal] = useState<{ open: boolean; seq: number }>({ open: true, seq: 0 });

  const [facultades, setFacultades] = useState<Facultad[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);

  // Actualiza URL sin navegación RSC para evitar parpadeos al marcar múltiples checkboxes
  const setParams = useCallback(
    (cambios: Record<string, string | null>) => {
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  // Catálogos para los filtros del lado izquierdo
  useEffect(() => {
    api<Facultad[]>("/api/catalogos/facultades").then(setFacultades).catch(() => {});
    api<Sede[]>("/api/catalogos/sedes").then(setSedes).catch(() => {});
    api<Gestion[]>("/api/catalogos/gestiones").then(setGestiones).catch(() => {});
  }, []);

  const facultadId = get("facultad_id");
  useEffect(() => {
    api<Carrera[]>("/api/catalogos/carreras", { facultad_id: facultadId || undefined })
      .then(setCarreras)
      .catch(() => {});
  }, [facultadId]);

  const queryKey = STATS_FILTROS.map((k) => `${k}=${get(k)}`).join("&");
  useEffect(() => {
    const ctrl = new AbortController();
    const params: Record<string, string> = {};
    for (const k of STATS_FILTROS) if (get(k)) params[k] = get(k);
    const t0 = performance.now();
    api<Stats>("/api/stats", params, ctrl.signal)
      .then((x) => {
        setS(x);
        setResKey(queryKey);
        setError(null);
        setMs(Math.round(performance.now() - t0));
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message ?? "Error al cargar estadísticas");
          setResKey(queryKey);
        }
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const selGestiones = parseList(get("gestion"));
  const selFacultades = parseList(get("facultad_id"));
  const selCarreras = parseList(get("carrera_id"));
  const selSedes = parseList(get("sede_id"));
  const selSexos = parseList(get("sexo"));

  const chips = useMemo(() => {
    const c: { id: string; k: string; v: string; label: string }[] = [];
    for (const v of selGestiones) {
      c.push({ id: `gestion:${v}`, k: "gestion", v, label: `Gestión ${v}` });
    }
    for (const v of selFacultades) {
      c.push({
        id: `facultad_id:${v}`,
        k: "facultad_id",
        v,
        label: titleCase(facultades.find((f) => String(f.id) === v)?.nombre ?? `Facultad #${v}`),
      });
    }
    for (const v of selCarreras) {
      c.push({
        id: `carrera_id:${v}`,
        k: "carrera_id",
        v,
        label: titleCase(carreras.find((x) => String(x.id) === v)?.nombre ?? `Carrera #${v}`),
      });
    }
    for (const v of selSedes) {
      c.push({
        id: `sede_id:${v}`,
        k: "sede_id",
        v,
        label: titleCase(sedes.find((x) => String(x.id) === v)?.nombre ?? `Sede #${v}`),
      });
    }
    for (const v of selSexos) {
      c.push({ id: `sexo:${v}`, k: "sexo", v, label: v === "M" ? "Masculino" : "Femenino" });
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, facultades, carreras, sedes]);

  const cargando = resKey !== queryKey;
  const searchQs = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of STATS_FILTROS) if (get(k)) p.set(k, get(k));
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const limpiarFiltros = () => window.history.replaceState(null, "", pathname);

  const r = s?.resumen;
  const gest = s ? s.por_gestion.filter((g) => Number(g.etiqueta) >= 2000) : [];
  const maxG = Math.max(1, ...gest.map((g) => g.total));

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      {/* Filtros al lado izquierdo (checkboxes con búsqueda interna, conteos y Ver más) */}
      <aside
        aria-label="Filtros de estadísticas"
        className={cn(
          "w-full shrink-0 lg:sticky lg:top-[72px] lg:block lg:w-[272px] xl:w-[292px] 2xl:w-[308px]",
          verFiltros ? "block" : "hidden",
        )}
      >
        <Card className="relative p-4 lg:max-h-[calc(100dvh-104px)] lg:overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#111827]">Filtros</h2>
              {chips.length > 0 && (
                <span className="rounded bg-[#F0F7F2] px-1.5 py-0.5 font-mono text-xs font-medium text-[#166534] ring-1 ring-inset ring-[#C4DEC9]">
                  {chips.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setOpenSignal((sig) => ({ open: !sig.open, seq: sig.seq + 1 }))}
                className="cursor-pointer text-xs font-medium text-[#5A6370] hover:text-[#111827] hover:underline"
              >
                {openSignal.open ? "Colapsar" : "Desplegar"}
              </button>
              {chips.length > 0 && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="cursor-pointer text-xs font-medium text-[#166534] hover:underline"
                >
                  Limpiar todo
                </button>
              )}
            </div>
          </div>

          <div className="mb-4">
            <Button variant="primary" className="w-full" onClick={() => router.push(searchQs)}>
              <span>Ver estudiantes en Búsqueda</span>
              <ArrowRight size={15} aria-hidden />
            </Button>
          </div>

          <div className="space-y-5">
            <FacetGroup
              title="Año (gestión)"
              searchable
              searchPlaceholder="Ej: 2024..."
              openSignal={openSignal}
              selected={selGestiones}
              onClearGroup={() => setParams({ gestion: null })}
              onToggle={(v) => setParams({ gestion: toggleInList(selGestiones, v) })}
              options={gestiones.map((g) => ({ value: String(g.gestion), label: String(g.gestion), count: g.total }))}
            />

            <FacetGroup
              title="Facultad"
              searchable
              searchPlaceholder="Escribir facultad..."
              openSignal={openSignal}
              selected={selFacultades}
              onClearGroup={() => setParams({ facultad_id: null })}
              onToggle={(v) => setParams({ facultad_id: toggleInList(selFacultades, v) })}
              options={facultades
                .filter((f) => f.total > 0 || selFacultades.includes(String(f.id)))
                .map((f) => ({ value: String(f.id), label: titleCase(f.nombre), count: f.total }))}
            />

            <FacetGroup
              title="Carrera"
              searchable
              searchPlaceholder="Escribir carrera..."
              openSignal={openSignal}
              selected={selCarreras}
              onClearGroup={() => setParams({ carrera_id: null })}
              onToggle={(v) => setParams({ carrera_id: toggleInList(selCarreras, v) })}
              options={carreras
                .filter((c) => c.total > 0 || selCarreras.includes(String(c.id)))
                .map((c) => ({ value: String(c.id), label: titleCase(c.nombre), count: c.total }))}
            />

            <FacetGroup
              title="Sede"
              searchable
              searchPlaceholder="Escribir sede..."
              openSignal={openSignal}
              selected={selSedes}
              onClearGroup={() => setParams({ sede_id: null })}
              onToggle={(v) => setParams({ sede_id: toggleInList(selSedes, v) })}
              options={sedes
                .filter((x) => x.total > 0 || selSedes.includes(String(x.id)))
                .map((x) => ({ value: String(x.id), label: titleCase(x.nombre), count: x.total }))}
            />

            <FacetGroup
              title="Género"
              openSignal={openSignal}
              selected={selSexos}
              onClearGroup={() => setParams({ sexo: null })}
              onToggle={(v) => setParams({ sexo: toggleInList(selSexos, v) })}
              options={[
                { value: "M", label: "Masculino" },
                { value: "F", label: "Femenino" },
              ]}
            />
          </div>
        </Card>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5 lg:min-h-[calc(100dvh-160px)]">
        <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setVerFiltros((v) => !v)}
            aria-expanded={verFiltros}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-[#E4E6EA] bg-white px-3 text-sm font-medium text-[#111827] hover:bg-[#F4F5F6]"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-[#4B5563]" aria-hidden />
              <span>Filtros de estadísticas</span>
              {chips.length > 0 && (
                <span className="rounded bg-[#166534] px-1.5 py-0.5 font-mono text-xs text-white">{chips.length}</span>
              )}
            </span>
            <CaretDown size={15} className={cn("text-[#5A6370] transition-transform", verFiltros && "rotate-180")} aria-hidden />
          </button>
        </div>

        {(chips.length > 0 || ms !== null || cargando) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setParams({ [c.k]: removeFromList(parseList(get(c.k)), c.v) })}
                  aria-label={`Quitar filtro ${c.label}`}
                  className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded border border-[#C4DEC9] bg-[#F0F7F2] px-2.5 py-0.5 text-xs font-medium text-[#166534] hover:bg-[#E2EFE6]"
                >
                  <span className="truncate">{c.label}</span>
                  <X size={12} weight="bold" aria-hidden />
                </button>
              ))}
              {chips.length > 0 && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="min-h-8 cursor-pointer px-2 text-xs font-medium text-[#4B5563] hover:text-[#111827] hover:underline"
                >
                  Quitar todo
                </button>
              )}
            </div>
            {cargando && s ? (
              <span className="text-xs font-medium text-[#166534]">Actualizando...</span>
            ) : (
              ms !== null && <span className="font-mono text-xs text-[#5A6370]">Actualizado en {ms} ms</span>
            )}
          </div>
        )}

        {error && <Card className="p-8 text-center text-sm text-[#991B1B]">No se pudo cargar: {error}</Card>}

        {!s && !error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-56" />
          </div>
        )}

        {s && r && (
          <div className="flex flex-1 flex-col gap-4 sm:gap-5">
            <KpiStrip
              items={[
                {
                  label: "Estudiantes",
                  value: fmtNum(r.total),
                  hint: `${r.facultades} facultades · ${r.sedes} sedes`,
                },
                {
                  label: "Con datos web",
                  value: fmtNum(r.en_web),
                  hint: `${((r.en_web / Math.max(1, r.total)) * 100).toFixed(1)} % del total · ${fmtNum(r.con_ci)} con CI`,
                  accent: true,
                },
                {
                  label: "Nuevos (fuera del PDF)",
                  value: fmtNum(r.solo_web),
                  hint: "Descubiertos por rangos",
                },
                {
                  label: "En la lista PDF",
                  value: fmtNum(r.en_padron),
                  hint: `H ${fmtNum(r.hombres)} · M ${fmtNum(r.mujeres)}`,
                },
              ]}
            />

            {r.total === 0 ? (
              <Card className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <p className="text-sm font-medium text-[#111827]">No hay estudiantes que coincidan con los filtros seleccionados</p>
                <p className="mt-1 text-xs text-[#5A6370]">Pruebe desmarcando alguno de los filtros del panel izquierdo.</p>
                <Button className="mt-4" onClick={limpiarFiltros}>
                  Restablecer filtros
                </Button>
              </Card>
            ) : (
              <>
                <Card className="p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <h2 className="text-sm font-semibold text-[#111827]">Estudiantes por gestión de ingreso</h2>
                    <span className="text-xs text-[#5A6370]">Haz clic en uno o más años para comparar y filtrar</span>
                  </div>
                  <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1">
                    <div className="flex h-48 min-w-[540px] items-end gap-1.5 pt-4 sm:gap-2">
                      {gest.map((g) => {
                        const etiqueta = String(g.etiqueta ?? "");
                        const activo = selGestiones.includes(etiqueta);
                        const labelCorto = g.total >= 1000 ? `${(g.total / 1000).toFixed(1)}k` : fmtNum(g.total);
                        const hPx = Math.max(4, Math.round((g.total / maxG) * 124));
                        const pctWeb = ((g.con_datos_web ?? 0) / Math.max(1, g.total)) * 100;
                        return (
                          <button
                            key={etiqueta}
                            type="button"
                            onClick={() => setParams({ gestion: toggleInList(selGestiones, etiqueta) })}
                            aria-pressed={activo}
                            title={`${etiqueta}: ${fmtNum(g.total)} estudiantes`}
                            className="group flex flex-1 cursor-pointer flex-col items-center justify-end gap-1"
                          >
                            <span
                              className={cn(
                                "font-mono text-[11px] tabular-nums",
                                activo ? "font-semibold text-[#166534]" : "text-[#5A6370] group-hover:text-[#111827]",
                              )}
                            >
                              {labelCorto}
                            </span>
                            <div
                              className={cn(
                                "relative w-full overflow-hidden rounded-t-sm bg-[#C4DEC9] transition-opacity",
                                activo ? "ring-2 ring-[#166534] ring-offset-1" : "opacity-85 group-hover:opacity-100",
                              )}
                              style={{ height: `${hPx}px` }}
                            >
                              <div className="absolute inset-x-0 bottom-0 bg-[#166534]" style={{ height: `${pctWeb}%` }} />
                            </div>
                            <span
                              className={cn(
                                "font-mono text-[11px] tabular-nums",
                                activo ? "font-semibold text-[#166534]" : "text-[#4B5563]",
                              )}
                            >
                              {etiqueta.slice(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5A6370]">
                    <span className="flex items-center gap-1.5">
                      <i className="h-2.5 w-2.5 rounded-xs bg-[#166534]" /> con datos web
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="h-2.5 w-2.5 rounded-xs bg-[#C4DEC9]" /> total del año
                    </span>
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                  <Card className="p-4 sm:p-5">
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold text-[#111827]">Por facultad</h2>
                      <span className="text-xs text-[#5A6370]">Clic para seleccionar</span>
                    </div>
                    <BarList
                      tone="accent"
                      activeKeys={selFacultades}
                      items={s.por_facultad.map((f) => ({ key: f.id ?? 0, label: titleCase(f.etiqueta), value: f.total }))}
                      onClick={(k) => setParams({ facultad_id: toggleInList(selFacultades, String(k)) })}
                    />
                  </Card>

                  <Card className="p-4 sm:p-5">
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold text-[#111827]">Carreras con mayor matrícula</h2>
                      <span className="text-xs text-[#5A6370]">Top 12</span>
                    </div>
                    <BarList
                      tone="muted"
                      activeKeys={selCarreras}
                      items={s.por_carrera.slice(0, 12).map((c) => ({
                        key: c.id ?? 0,
                        label: titleCase(c.etiqueta?.split(" · ")[0]),
                        value: c.total,
                      }))}
                      onClick={(k) => setParams({ carrera_id: toggleInList(selCarreras, String(k)) })}
                    />
                  </Card>

                  <Card className="p-4 sm:p-5 xl:col-span-2 2xl:col-span-1">
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold text-[#111827]">Por sede</h2>
                      <span className="text-xs text-[#5A6370]">Clic para seleccionar</span>
                    </div>
                    <BarList
                      tone="accent"
                      activeKeys={selSedes}
                      items={s.por_sede
                        .filter((x) => x.total > 0)
                        .map((x) => ({ key: x.id ?? 0, label: titleCase(x.etiqueta), value: x.total }))}
                      onClick={(k) => setParams({ sede_id: toggleInList(selSedes, String(k)) })}
                    />
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
