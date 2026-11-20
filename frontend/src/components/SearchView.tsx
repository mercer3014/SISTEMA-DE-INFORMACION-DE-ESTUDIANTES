"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudentDrawer } from "@/components/StudentDrawer";
import { Badge, Button, Card, Select, Skeleton } from "@/components/ui/primitives";
import { api, type Carrera, type EstudianteResumen, type Facultad, type Gestion, type Paginado, type Sede } from "@/lib/api";
import { cn, fmtNum, titleCase } from "@/lib/format";

const FILTROS = ["q", "facultad_id", "carrera_id", "sede_id", "gestion", "fuente", "sexo", "sort", "order", "page", "page_size"] as const;

type SortKey = "relevancia" | "nombre" | "registro" | "gestion" | "carrera" | "facultad" | "ci";

export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  const [texto, setTexto] = useState(get("q"));
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

  const setParams = useCallback(
    (cambios: Record<string, string | null>, resetPage = true) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      if (resetPage && !("page" in cambios)) p.delete("page");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  // catálogos
  useEffect(() => {
    api<Facultad[]>("/api/catalogos/facultades").then(setFacultades).catch(() => {});
    api<Sede[]>("/api/catalogos/sedes").then(setSedes).catch(() => {});
    api<Gestion[]>("/api/catalogos/gestiones").then(setGestiones).catch(() => {});
  }, []);
  const facultadId = get("facultad_id");
  useEffect(() => {
    api<Carrera[]>("/api/catalogos/carreras", { facultad_id: facultadId || undefined }).then(setCarreras).catch(() => {});
  }, [facultadId]);

  // búsqueda con debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (texto.trim() !== get("q")) setParams({ q: texto.trim() || null });
    }, 300);
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
      .then((r) => { setRes(r); setResKey(queryKey); setError(null); setMs(Math.round(performance.now() - t0)); })
      .catch((e) => {
        if (e.name !== "AbortError") { setError({ key: queryKey, msg: e.message ?? "Error de conexión con la API" }); setResKey(queryKey); }
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // atajo "/" para enfocar la búsqueda
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); inputRef.current?.focus(); }
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

  const cargando = resKey !== queryKey;
  const errorMsg = error && error.key === queryKey ? error.msg : null;
  const hayFiltros = FILTROS.some((k) => !["sort", "order", "page", "page_size"].includes(k) && get(k));
  const page = Number(get("page") || 1);
  const detalle = get("r");

  const chips = useMemo(() => {
    const c: { k: string; label: string }[] = [];
    if (get("facultad_id")) c.push({ k: "facultad_id", label: titleCase(facultades.find((f) => String(f.id) === get("facultad_id"))?.nombre ?? "Facultad") });
    if (get("carrera_id")) c.push({ k: "carrera_id", label: titleCase(carreras.find((f) => String(f.id) === get("carrera_id"))?.nombre ?? "Carrera") });
    if (get("sede_id")) c.push({ k: "sede_id", label: titleCase(sedes.find((f) => String(f.id) === get("sede_id"))?.nombre ?? "Sede") });
    if (get("gestion")) c.push({ k: "gestion", label: `Gestión ${get("gestion")}` });
    if (get("sexo")) c.push({ k: "sexo", label: get("sexo") === "M" ? "Masculino" : "Femenino" });
    if (get("fuente")) c.push({ k: "fuente", label: { web: "Con datos web", solo_web: "Sólo datos web", solo_pdf: "Sólo lista PDF" }[get("fuente")] ?? get("fuente") });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, facultades, carreras, sedes]);

  return (
    <div className="space-y-5">
      {/* Buscador */}
      <Card className="p-3 sm:p-5">
        <div className="relative">
          <svg aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 sm:left-4 h-5 w-5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Buscar estudiantes"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, registro o carnet (CI)…"
            className={cn("h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-11 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:h-14 sm:pl-12 [&::-webkit-search-cancel-button]:hidden", texto ? "pr-24" : "pr-4 lg:pr-12")}
            autoFocus
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-2 sm:right-3">
            {texto && (
              <button onClick={() => { setTexto(""); setParams({ q: null }); }} className="h-11 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-200 sm:h-9 sm:text-xs">Limpiar</button>
            )}
            <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-400 lg:block">/</kbd>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setVerFiltros((v) => !v)}
          aria-expanded={verFiltros}
          aria-controls="filtros"
          className="mt-3 flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 sm:hidden"
        >
          <span className="flex items-center gap-2">
            <svg aria-hidden className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
            Filtros
            {chips.length > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{chips.length}</span>}
          </span>
          <svg aria-hidden className={cn("h-4 w-4 text-slate-400 transition-transform", verFiltros && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
        </button>

        <div id="filtros" className={cn("mt-3 grid-cols-1 gap-2.5 sm:mt-4 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6", verFiltros ? "grid" : "hidden")}>
          <Select aria-label="Facultad" value={get("facultad_id")} onChange={(e) => setParams({ facultad_id: e.target.value || null, carrera_id: null })} className="sm:col-span-2 md:col-span-3 lg:col-span-2">
            <option value="">Todas las facultades</option>
            {facultades.map((f) => <option key={f.id} value={f.id}>{titleCase(f.nombre)} ({fmtNum(f.total)})</option>)}
          </Select>
          <Select aria-label="Carrera" value={get("carrera_id")} onChange={(e) => setParams({ carrera_id: e.target.value || null })} className="sm:col-span-2 md:col-span-3 lg:col-span-2">
            <option value="">Todas las carreras</option>
            {carreras.filter((c) => c.total > 0).map((c) => <option key={c.id} value={c.id}>{titleCase(c.nombre)} ({fmtNum(c.total)})</option>)}
          </Select>
          <Select aria-label="Gestión" value={get("gestion")} onChange={(e) => setParams({ gestion: e.target.value || null })}>
            <option value="">Toda gestión</option>
            {gestiones.map((g) => <option key={g.gestion} value={g.gestion}>{g.gestion} ({fmtNum(g.total)})</option>)}
          </Select>
          <Select aria-label="Sede" value={get("sede_id")} onChange={(e) => setParams({ sede_id: e.target.value || null })}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{titleCase(s.nombre)}</option>)}
          </Select>
          <Select aria-label="Sexo" value={get("sexo")} onChange={(e) => setParams({ sexo: e.target.value || null })}>
            <option value="">Sexo: todos</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </Select>
          <Select aria-label="Fuente" value={get("fuente")} onChange={(e) => setParams({ fuente: e.target.value || null })}>
            <option value="">Fuente: todas</option>
            <option value="web">Con datos web</option>
            <option value="solo_web">Sólo datos web (nuevos)</option>
            <option value="solo_pdf">Sólo en la lista PDF</option>
          </Select>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button key={c.k} onClick={() => setParams({ [c.k]: null, ...(c.k === "facultad_id" ? { carrera_id: null } : {}) })}
                aria-label={`Quitar filtro ${c.label}`}
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100">
                <span className="truncate">{c.label}</span> <span aria-hidden className="text-base leading-none">×</span>
              </button>
            ))}
            {hayFiltros && (
              <button onClick={() => { setTexto(""); router.replace(pathname); }} className="min-h-9 px-1 text-xs text-slate-500 underline-offset-2 hover:underline">Quitar todo</button>
            )}
          </div>
        )}
      </Card>

      {/* Resultados */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm text-slate-600">
            {res ? (<><span className="font-semibold text-slate-900">{fmtNum(res.total)}</span> estudiantes{ms !== null && <span className="text-slate-400"> · {ms} ms</span>}</>) : "Cargando…"}
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-500">
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
            <Button className="lg:hidden" aria-label={order === "desc" ? "Orden descendente" : "Orden ascendente"} onClick={() => setParams({ sort, order: order === "asc" ? "desc" : "asc" })}>
              {order === "desc" ? "▼" : "▲"}
            </Button>
            <span className="hidden sm:inline">Filas</span>
            <Select aria-label="Filas por página" className="w-20" value={get("page_size") || "25"} onChange={(e) => setParams({ page_size: e.target.value === "25" ? null : e.target.value })}>
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
        </div>

        {errorMsg ? (
          <div className="p-10 text-center">
            <p className="font-medium text-rose-700">No se pudo consultar la API</p>
            <p className="mt-1 text-sm text-slate-500">{errorMsg}. Verifique que el backend esté corriendo y que API_INTERNAL_URL sea correcto.</p>
          </div>
        ) : (
          <>
          {/* Teléfono / tablet: tarjetas */}
          <ul className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:gap-3 md:divide-y-0 md:p-3 lg:hidden">
            {cargando && !res
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="space-y-2 p-4 md:rounded-xl md:border md:border-slate-100"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" /></li>
                ))
              : res?.data.map((e) => (
                  <li key={e.registro}>
                    <button
                      type="button"
                      onClick={() => setParams({ r: e.registro }, false)}
                      className={cn(
                        "block w-full p-4 text-left transition active:bg-blue-50 md:h-full md:rounded-xl md:border md:border-slate-200 md:hover:border-blue-300 md:hover:bg-blue-50/40",
                        cargando && "opacity-50",
                        detalle === e.registro && "bg-blue-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words font-medium leading-snug text-slate-900">{e.nombre_completo}</p>
                        <div className="flex shrink-0 gap-1 pt-0.5">
                          {e.en_web && <Badge tone="green">Web</Badge>}
                          {e.en_padron && <Badge tone="slate">PDF</Badge>}
                        </div>
                      </div>
                      {(e.carrera || e.facultad) && (
                        <p className="mt-1 text-sm leading-snug text-slate-600">
                          {titleCase(e.carrera)}
                          {e.facultad && <span className="block text-xs text-slate-500">{titleCase(e.facultad)}</span>}
                        </p>
                      )}
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs min-[420px]:grid-cols-4 md:grid-cols-2">
                        <div className="min-w-0"><dt className="text-slate-400">Registro</dt><dd className="break-all font-mono text-[13px] text-slate-800">{e.registro}</dd></div>
                        <div className="min-w-0"><dt className="text-slate-400">CI</dt><dd className="truncate font-mono text-[13px] text-slate-800">{e.ci ?? "—"}</dd></div>
                        <div className="min-w-0"><dt className="text-slate-400">Gestión</dt><dd className="tabular-nums text-[13px] text-slate-800">{e.gestion_ingreso ?? "—"}</dd></div>
                        <div className="min-w-0"><dt className="text-slate-400">Sede</dt><dd className="truncate text-[13px] text-slate-800">{titleCase(e.sede) || "—"}</dd></div>
                      </dl>
                    </button>
                  </li>
                ))}
            {res && res.data.length === 0 && !cargando && (
              <li className="col-span-full px-4 py-16 text-center text-slate-500">Sin resultados. Pruebe con menos palabras o quite filtros.</li>
            )}
          </ul>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th k="registro" sort={sort} order={order} onSort={toggleSort}>Registro</Th>
                  <Th k="nombre" sort={sort} order={order} onSort={toggleSort}>Nombre completo</Th>
                  <Th k="ci" sort={sort} order={order} onSort={toggleSort}>CI</Th>
                  <Th k="carrera" sort={sort} order={order} onSort={toggleSort}>Carrera / Facultad</Th>
                  <Th k="gestion" sort={sort} order={order} onSort={toggleSort}>Gestión</Th>
                  <th className="px-4 py-3 font-medium">Sede</th>
                  <th className="px-4 py-3 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando && !res
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                    ))
                  : res?.data.map((e) => (
                      <tr key={e.registro} onClick={() => setParams({ r: e.registro }, false)}
                        tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setParams({ r: e.registro }, false); } }}
                        className={cn("cursor-pointer transition hover:bg-blue-50/60 focus-visible:bg-blue-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600", cargando && "opacity-50", detalle === e.registro && "bg-blue-50")}>
                        <td className="px-4 py-3 font-mono text-[13px] text-slate-700">{e.registro}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{e.nombre_completo}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{e.ci ?? <span className="text-slate-300">—</span>}</td>
                        <td className="max-w-[320px] px-4 py-3">
                          <div className="truncate text-slate-800" title={e.carrera ?? ""}>{titleCase(e.carrera)}</div>
                          <div className="truncate text-xs text-slate-500" title={e.facultad ?? ""}>{titleCase(e.facultad)}</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{e.gestion_ingreso ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{titleCase(e.sede) || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {e.en_web && <Badge tone="green">Web</Badge>}
                            {e.en_padron && <Badge tone="slate">PDF</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                {res && res.data.length === 0 && !cargando && (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">Sin resultados. Pruebe con menos palabras o quite filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}

        {res && res.pages > 1 && (
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-center text-sm text-slate-500 sm:text-left">Página <span className="font-medium text-slate-800">{fmtNum(page)}</span> de {fmtNum(res.pages)}</p>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-1.5 sm:flex">
              <Button aria-label="Primera página" disabled={page <= 1} onClick={() => setParams({ page: null }, false)}>«</Button>
              <Button disabled={page <= 1} onClick={() => setParams({ page: page - 1 > 1 ? String(page - 1) : null }, false)}>Anterior</Button>
              <Button disabled={page >= res.pages} onClick={() => setParams({ page: String(page + 1) }, false)}>Siguiente</Button>
              <Button aria-label="Última página" disabled={page >= res.pages} onClick={() => setParams({ page: String(res.pages) }, false)}>»</Button>
            </div>
          </div>
        )}
      </Card>

      <StudentDrawer registro={detalle || null} onClose={() => setParams({ r: null }, false)} />
    </div>
  );
}

function Th({ k, sort, order, onSort, children }: { k: SortKey; sort: SortKey; order: string; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  const activo = sort === k;
  return (
    <th className="px-4 py-3 font-medium" aria-sort={activo ? (order === "desc" ? "descending" : "ascending") : undefined}>
      <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900", activo && "text-blue-700")}>
        {children}
        <span aria-hidden className="text-[10px]">{activo ? (order === "desc" ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}
