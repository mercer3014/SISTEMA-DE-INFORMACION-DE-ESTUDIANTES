"use client";

import {
  ArrowDown,
  ArrowUp,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretUpDown,
  MagnifyingGlass,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudentDrawer } from "@/components/StudentDrawer";
import { FacetGroup } from "@/components/ui/FacetGroup";
import { Badge, Button, Card, Select, Skeleton } from "@/components/ui/primitives";
import { api, type Carrera, type EstudianteResumen, type Facultad, type Gestion, type Paginado, type Sede } from "@/lib/api";
import { cn, fmtNum, parseList, removeFromList, titleCase, toggleInList } from "@/lib/format";

const FILTROS = [
  "q",
  "facultad_id",
  "carrera_id",
  "sede_id",
  "gestion",
  "fuente",
  "sexo",
  "activo",
  "sort",
  "order",
  "page",
  "page_size",
] as const;

type SortKey = "relevancia" | "nombre" | "registro" | "gestion" | "carrera" | "facultad" | "ci";

export function SearchView() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  const spQ = get("q");
  const [lastSyncedQ, setLastSyncedQ] = useState(spQ);
  const [texto, setTexto] = useState(spQ);
  if (spQ !== lastSyncedQ) {
    setLastSyncedQ(spQ);
    setTexto(spQ);
  }

  const [res, setRes] = useState<Paginado<EstudianteResumen> | null>(null);
  const [resKey, setResKey] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; msg: string } | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [facultades, setFacultades] = useState<Facultad[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [verFiltros, setVerFiltros] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Actualiza la URL en memoria sin navegación RSC para evitar parpadeos al escribir o marcar filtros
  const setParams = useCallback(
    (cambios: Record<string, string | null>, resetPage = true) => {
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      if (resetPage && !("page" in cambios)) p.delete("page");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  // Catálogos (cacheados 60 s en cliente y backend)
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

  // Búsqueda con debounce
  useEffect(() => {
    const trimmed = texto.trim();
    const t = setTimeout(() => {
      if (trimmed !== spQ) {
        setLastSyncedQ(trimmed);
        setParams({ q: trimmed || null });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const queryKey = FILTROS.map((k) => `${k}=${get(k)}`).join("&");
  useEffect(() => {
    const ctrl = new AbortController();
    const params: Record<string, string> = {};
    for (const k of FILTROS) if (get(k)) params[k] = get(k);
    const t0 = performance.now();
    api<Paginado<EstudianteResumen>>("/api/estudiantes", params, ctrl.signal)
      .then((r) => {
        setRes(r);
        setResKey(queryKey);
        setError(null);
        setMs(Math.round(performance.now() - t0));
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError({ key: queryKey, msg: e.message ?? "Error de conexión con la API" });
          setResKey(queryKey);
        }
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Atajo "/" para enfocar el buscador
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA" && !el?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const sort = (get("sort") || (get("q") ? "relevancia" : "nombre")) as SortKey;
  const order = get("order") || "asc";
  const toggleSort = (k: SortKey) => {
    if (sort === k) setParams({ sort: k, order: order === "asc" ? "desc" : "asc" });
    else setParams({ sort: k, order: "asc" });
  };

  const selFacultades = parseList(get("facultad_id"));
  const selCarreras = parseList(get("carrera_id"));
  const selSedes = parseList(get("sede_id"));
  const selGestiones = parseList(get("gestion"));
  const selSexos = parseList(get("sexo"));
  const selActivos = parseList(get("activo"));
  const selFuente = get("fuente") ? [get("fuente")] : [];

  const cargando = resKey !== queryKey;
  const errorMsg = error && error.key === queryKey ? error.msg : null;
  const hayFiltros = FILTROS.some((k) => !["sort", "order", "page", "page_size"].includes(k) && get(k));
  const page = Number(get("page") || 1);
  const detalle = get("r");

  const chips = useMemo(() => {
    const c: { id: string; k: string; v: string; label: string }[] = [];
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
        label: titleCase(sedes.find((s) => String(s.id) === v)?.nombre ?? `Sede #${v}`),
      });
    }
    for (const v of selGestiones) {
      c.push({ id: `gestion:${v}`, k: "gestion", v, label: `Gestión ${v}` });
    }
    for (const v of selSexos) {
      c.push({ id: `sexo:${v}`, k: "sexo", v, label: v === "M" ? "Masculino" : "Femenino" });
    }
    for (const v of selActivos) {
      c.push({ id: `activo:${v}`, k: "activo", v, label: v === "true" ? "Activos" : "Inactivos" });
    }
    for (const v of selFuente) {
      c.push({
        id: `fuente:${v}`,
        k: "fuente",
        v,
        label: { web: "Con datos web", solo_web: "Nuevos (solo web)", solo_pdf: "Solo lista PDF" }[v] ?? v,
      });
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, facultades, carreras, sedes]);

  const limpiarSidebar = () =>
    setParams({
      facultad_id: null,
      carrera_id: null,
      sede_id: null,
      gestion: null,
      sexo: null,
      activo: null,
      fuente: null,
    });

  const limpiarTodo = () => {
    setLastSyncedQ("");
    setTexto("");
    window.history.replaceState(null, "", pathname);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        {/* Panel lateral izquierdo de checkboxes con búsqueda interna */}
        <aside
          aria-label="Filtros de búsqueda"
          className={cn(
            "w-full shrink-0 lg:sticky lg:top-[72px] lg:block lg:w-[272px] xl:w-[292px] 2xl:w-[308px]",
            verFiltros ? "block" : "hidden",
          )}
        >
          <Card className="p-4 lg:max-h-[calc(100dvh-88px)] lg:overflow-y-auto">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#111827]">Filtros</h2>
                {chips.length > 0 && (
                  <span className="rounded bg-[#F0F7F2] px-1.5 py-0.5 font-mono text-xs font-medium text-[#166534] ring-1 ring-inset ring-[#C4DEC9]">
                    {chips.length}
                  </span>
                )}
              </div>
              {chips.length > 0 && (
                <button type="button" onClick={limpiarSidebar} className="cursor-pointer text-xs font-medium text-[#166534] hover:underline">
                  Limpiar todo
                </button>
              )}
            </div>

            <div className="space-y-5">
              <FacetGroup
                title="Facultad"
                searchable
                searchPlaceholder="Escribir facultad..."
                initialLimit={8}
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
                initialLimit={8}
                selected={selCarreras}
                onClearGroup={() => setParams({ carrera_id: null })}
                onToggle={(v) => setParams({ carrera_id: toggleInList(selCarreras, v) })}
                options={carreras
                  .filter((c) => c.total > 0 || selCarreras.includes(String(c.id)))
                  .map((c) => ({ value: String(c.id), label: titleCase(c.nombre), count: c.total }))}
              />

              <FacetGroup
                title="Gestión"
                searchable
                searchPlaceholder="Ej: 2024..."
                initialLimit={8}
                selected={selGestiones}
                onClearGroup={() => setParams({ gestion: null })}
                onToggle={(v) => setParams({ gestion: toggleInList(selGestiones, v) })}
                options={gestiones.map((g) => ({ value: String(g.gestion), label: String(g.gestion), count: g.total }))}
              />

              <FacetGroup
                title="Sede"
                searchable
                searchPlaceholder="Escribir sede..."
                initialLimit={12}
                selected={selSedes}
                onClearGroup={() => setParams({ sede_id: null })}
                onToggle={(v) => setParams({ sede_id: toggleInList(selSedes, v) })}
                options={sedes
                  .filter((s) => s.total > 0 || selSedes.includes(String(s.id)))
                  .map((s) => ({ value: String(s.id), label: titleCase(s.nombre), count: s.total }))}
              />

              <FacetGroup
                title="Género"
                initialLimit={5}
                selected={selSexos}
                onClearGroup={() => setParams({ sexo: null })}
                onToggle={(v) => setParams({ sexo: toggleInList(selSexos, v) })}
                options={[
                  { value: "M", label: "Masculino" },
                  { value: "F", label: "Femenino" },
                ]}
              />

              <FacetGroup
                title="Estado"
                initialLimit={5}
                selected={selActivos}
                onClearGroup={() => setParams({ activo: null })}
                onToggle={(v) => setParams({ activo: toggleInList(selActivos, v) })}
                options={[
                  { value: "true", label: "Activos" },
                  { value: "false", label: "Inactivos" },
                ]}
              />

              <FacetGroup
                title="Fuente"
                initialLimit={5}
                selected={selFuente}
                onClearGroup={() => setParams({ fuente: null })}
                onToggle={(v) => setParams({ fuente: get("fuente") === v ? null : v })}
                options={[
                  { value: "web", label: "Con datos web" },
                  { value: "solo_web", label: "Nuevos (solo web)" },
                  { value: "solo_pdf", label: "Solo lista PDF" },
                ]}
              />
            </div>
          </Card>
        </aside>

        {/* Columna principal: buscador + tabla */}
        <div className="min-w-0 flex-1 space-y-4">
          <Card className="p-3 sm:p-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={18}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6370]"
                />
                <input
                  ref={inputRef}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Buscar estudiantes por nombre, registro o carnet"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Nombre, apellido, registro o carnet (CI)..."
                  className={cn(
                    "h-11 w-full appearance-none rounded-md border border-[#E4E6EA] bg-[#FAFAFA] pl-10 text-base text-[#111827] outline-none transition placeholder:text-[#5A6370] focus:border-[#166534] focus:bg-white focus:ring-2 focus:ring-[#166534]/15 sm:text-sm [&::-webkit-search-cancel-button]:hidden",
                    texto ? "pr-24" : "pr-4 lg:pr-12",
                  )}
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  {texto && (
                    <button
                      type="button"
                      onClick={() => {
                        setLastSyncedQ("");
                        setTexto("");
                        setParams({ q: null });
                      }}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium text-[#4B5563] hover:bg-[#ECEEF0] hover:text-[#111827]"
                    >
                      <X size={13} aria-hidden />
                      <span>Limpiar</span>
                    </button>
                  )}
                  <kbd className="hidden rounded border border-[#E4E6EA] bg-white px-1.5 py-0.5 font-mono text-xs text-[#5A6370] lg:block">
                    /
                  </kbd>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setVerFiltros((v) => !v)}
                aria-expanded={verFiltros}
                className="inline-flex h-11 cursor-pointer items-center justify-between gap-2 rounded-md border border-[#E4E6EA] bg-white px-3 text-sm font-medium text-[#111827] hover:bg-[#F4F5F6] lg:hidden"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-[#4B5563]" aria-hidden />
                  <span>Filtros</span>
                  {chips.length > 0 && (
                    <span className="rounded bg-[#166534] px-1.5 py-0.5 font-mono text-xs text-white">{chips.length}</span>
                  )}
                </span>
                <CaretDown size={15} className={cn("text-[#5A6370] transition-transform", verFiltros && "rotate-180")} aria-hidden />
              </button>
            </div>

            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#EFEFF2] pt-2.5">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setParams({
                        [c.k]: c.k === "fuente" ? null : removeFromList(parseList(get(c.k)), c.v),
                      })
                    }
                    aria-label={`Quitar filtro ${c.label}`}
                    className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded border border-[#C4DEC9] bg-[#F0F7F2] px-2.5 py-0.5 text-xs font-medium text-[#166534] hover:bg-[#E2EFE6]"
                  >
                    <span className="truncate">{c.label}</span>
                    <X size={12} weight="bold" aria-hidden />
                  </button>
                ))}
                {hayFiltros && (
                  <button
                    type="button"
                    onClick={limpiarTodo}
                    className="min-h-8 cursor-pointer px-2 text-xs font-medium text-[#4B5563] underline-offset-2 hover:text-[#111827] hover:underline"
                  >
                    Quitar todo
                  </button>
                )}
              </div>
            )}
          </Card>

          <Card className="relative overflow-hidden">
            {cargando && res && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#166534]" aria-hidden />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6EA] px-4 py-2.5 sm:px-5">
              <p className="text-xs text-[#4B5563] sm:text-sm">
                {res ? (
                  <>
                    <span className="font-mono font-semibold tabular-nums text-[#111827]">{fmtNum(res.total)}</span> estudiantes
                    {cargando ? (
                      <span className="ml-2 text-xs font-medium text-[#166534]">Actualizando...</span>
                    ) : (
                      ms !== null && <span className="font-mono text-xs text-[#5A6370]"> · {ms} ms</span>
                    )}
                  </>
                ) : (
                  "Cargando..."
                )}
              </p>

              <div className="flex items-center gap-2 text-xs text-[#4B5563] sm:text-sm">
                <label className="flex items-center gap-1.5 lg:hidden">
                  <span className="sr-only sm:not-sr-only">Orden</span>
                  <Select aria-label="Ordenar por" className="w-auto" value={sort} onChange={(e) => setParams({ sort: e.target.value, order: "asc" })}>
                    {get("q") && <option value="relevancia">Relevancia</option>}
                    <option value="nombre">Nombre</option>
                    <option value="registro">Registro</option>
                    <option value="ci">CI</option>
                    <option value="carrera">Carrera</option>
                    <option value="facultad">Facultad</option>
                    <option value="gestion">Gestión</option>
                  </Select>
                </label>
                <Button
                  className="px-2.5 lg:hidden"
                  aria-label={order === "desc" ? "Orden descendente" : "Orden ascendente"}
                  onClick={() => setParams({ sort, order: order === "asc" ? "desc" : "asc" })}
                >
                  {order === "desc" ? <ArrowDown size={15} aria-hidden /> : <ArrowUp size={15} aria-hidden />}
                </Button>
                <span className="hidden sm:inline">Filas</span>
                <Select
                  aria-label="Filas por página"
                  className="w-20"
                  value={get("page_size") || "25"}
                  onChange={(e) => setParams({ page_size: e.target.value === "25" ? null : e.target.value })}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {errorMsg ? (
              <div className="p-10 text-center">
                <p className="font-medium text-[#991B1B]">No se pudo consultar la API</p>
                <p className="mt-1 text-sm text-[#5A6370]">{errorMsg}. Verifique que el backend esté activo.</p>
              </div>
            ) : (
              <>
                {/* Teléfono / tablet: tarjetas */}
                <ul className="grid grid-cols-1 divide-y divide-[#EFEFF2] md:grid-cols-2 md:gap-3 md:divide-y-0 md:p-3 lg:hidden">
                  {cargando && !res
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <li key={i} className="space-y-2 p-4 md:rounded-md md:border md:border-[#E4E6EA]">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-4 w-full" />
                        </li>
                      ))
                    : res?.data.map((e) => (
                        <li key={e.registro}>
                          <button
                            type="button"
                            onClick={() => setParams({ r: e.registro }, false)}
                            className={cn(
                              "block w-full cursor-pointer p-4 text-left transition-colors active:bg-[#F0F7F2] md:h-full md:rounded-md md:border md:border-[#E4E6EA] md:hover:border-[#C4DEC9] md:hover:bg-[#F4F5F6]",
                              detalle === e.registro && "bg-[#F0F7F2] md:border-[#166534]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 break-words font-medium leading-snug text-[#111827]">{e.nombre_completo}</p>
                              <div className="flex shrink-0 gap-1 pt-0.5">
                                {e.en_web && <Badge tone="accent">Web</Badge>}
                                {e.en_padron && <Badge tone="neutral">PDF</Badge>}
                              </div>
                            </div>
                            {(e.carrera || e.facultad) && (
                              <p className="mt-1 text-sm leading-snug text-[#4B5563]">
                                {titleCase(e.carrera)}
                                {e.facultad && <span className="block text-xs text-[#5A6370]">{titleCase(e.facultad)}</span>}
                              </p>
                            )}
                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs min-[420px]:grid-cols-4 md:grid-cols-2">
                              <div className="min-w-0">
                                <dt className="text-[#5A6370]">Registro</dt>
                                <dd className="break-all font-mono text-[13px] text-[#111827]">{e.registro}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-[#5A6370]">CI</dt>
                                <dd className="truncate font-mono text-[13px] text-[#111827]">{e.ci ?? "—"}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-[#5A6370]">Gestión</dt>
                                <dd className="font-mono tabular-nums text-[13px] text-[#111827]">{e.gestion_ingreso ?? "—"}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-[#5A6370]">Sede</dt>
                                <dd className="truncate text-[13px] text-[#111827]">{titleCase(e.sede) || "—"}</dd>
                              </div>
                            </dl>
                          </button>
                        </li>
                      ))}
                  {res && res.data.length === 0 && !cargando && (
                    <li className="col-span-full px-4 py-14 text-center text-sm text-[#5A6370]">
                      <p>Sin resultados para esta búsqueda.</p>
                      {hayFiltros && (
                        <Button className="mt-3" onClick={limpiarTodo}>
                          Restablecer filtros
                        </Button>
                      )}
                    </li>
                  )}
                </ul>

                {/* Escritorio: tabla aprovechando el ancho disponible */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#E4E6EA] bg-[#F4F5F6] text-left text-xs text-[#5A6370]">
                      <tr>
                        <Th k="registro" sort={sort} order={order} onSort={toggleSort}>
                          Registro
                        </Th>
                        <Th k="nombre" sort={sort} order={order} onSort={toggleSort}>
                          Nombre completo
                        </Th>
                        <Th k="ci" sort={sort} order={order} onSort={toggleSort}>
                          CI
                        </Th>
                        <Th k="carrera" sort={sort} order={order} onSort={toggleSort}>
                          Carrera / Facultad
                        </Th>
                        <Th k="gestion" sort={sort} order={order} onSort={toggleSort}>
                          Gestión
                        </Th>
                        <th className="px-4 py-2.5 font-medium">Sede</th>
                        <th className="px-4 py-2.5 font-medium">Fuente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFF2]">
                      {cargando && !res
                        ? Array.from({ length: 10 }).map((_, i) => (
                            <tr key={i}>
                              {Array.from({ length: 7 }).map((__, j) => (
                                <td key={j} className="px-4 py-3">
                                  <Skeleton className="h-4 w-full" />
                                </td>
                              ))}
                            </tr>
                          ))
                        : res?.data.map((e) => (
                            <tr
                              key={e.registro}
                              onClick={() => setParams({ r: e.registro }, false)}
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  setParams({ r: e.registro }, false);
                                }
                              }}
                              className={cn(
                                "cursor-pointer transition-colors hover:bg-[#F4F5F6] focus-visible:bg-[#F0F7F2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#166534]",
                                detalle === e.registro && "bg-[#F0F7F2]",
                              )}
                            >
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] tabular-nums text-[#4B5563]">
                                {e.registro}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-[#111827]">{e.nombre_completo}</div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] tabular-nums text-[#4B5563]">
                                {e.ci ?? <span className="text-[#9CA3AF]">—</span>}
                              </td>
                              <td className="max-w-[460px] px-4 py-2.5 2xl:max-w-none">
                                <div className="truncate text-[#111827]" title={e.carrera ?? ""}>
                                  {titleCase(e.carrera)}
                                </div>
                                <div className="truncate text-xs text-[#5A6370]" title={e.facultad ?? ""}>
                                  {titleCase(e.facultad)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-[#4B5563]">
                                {e.gestion_ingreso ?? "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-[#4B5563]">{titleCase(e.sede) || "—"}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1">
                                  {e.en_web && <Badge tone="accent">Web</Badge>}
                                  {e.en_padron && <Badge tone="neutral">PDF</Badge>}
                                </div>
                              </td>
                            </tr>
                          ))}
                      {res && res.data.length === 0 && !cargando && (
                        <tr>
                          <td colSpan={7} className="px-4 py-14 text-center text-sm text-[#5A6370]">
                            <p>Sin resultados para esta búsqueda.</p>
                            {hayFiltros && (
                              <Button className="mt-3" onClick={limpiarTodo}>
                                Restablecer filtros
                              </Button>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {res && res.pages > 1 && (
              <div className="flex flex-col gap-2 border-t border-[#E4E6EA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-center text-xs text-[#5A6370] sm:text-left sm:text-sm">
                  Página <span className="font-mono font-medium text-[#111827]">{fmtNum(page)}</span> de{" "}
                  <span className="font-mono">{fmtNum(res.pages)}</span>
                </p>
                <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-1.5 sm:flex">
                  <Button aria-label="Primera página" disabled={page <= 1} onClick={() => setParams({ page: null }, false)}>
                    <CaretDoubleLeft size={14} aria-hidden />
                  </Button>
                  <Button
                    disabled={page <= 1}
                    onClick={() => setParams({ page: page - 1 > 1 ? String(page - 1) : null }, false)}
                  >
                    <CaretLeft size={14} aria-hidden />
                    <span>Anterior</span>
                  </Button>
                  <Button disabled={page >= res.pages} onClick={() => setParams({ page: String(page + 1) }, false)}>
                    <span>Siguiente</span>
                    <CaretRight size={14} aria-hidden />
                  </Button>
                  <Button aria-label="Última página" disabled={page >= res.pages} onClick={() => setParams({ page: String(res.pages) }, false)}>
                    <CaretDoubleRight size={14} aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <StudentDrawer
        registro={detalle || null}
        registrosVisibles={res?.data.map((d) => d.registro) ?? []}
        onSelectRegistro={(r) => setParams({ r }, false)}
        onClose={() => setParams({ r: null }, false)}
      />
    </div>
  );
}

function Th({
  k,
  sort,
  order,
  onSort,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  order: string;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const activo = sort === k;
  return (
    <th className="px-4 py-2.5 font-medium" aria-sort={activo ? (order === "desc" ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex cursor-pointer items-center gap-1 hover:text-[#111827]", activo && "font-semibold text-[#166534]")}
      >
        <span>{children}</span>
        {activo ? (
          order === "desc" ? (
            <CaretDown size={12} weight="bold" aria-hidden />
          ) : (
            <CaretUp size={12} weight="bold" aria-hidden />
          )
        ) : (
          <CaretUpDown size={12} aria-hidden className="opacity-60" />
        )}
      </button>
    </th>
  );
}
