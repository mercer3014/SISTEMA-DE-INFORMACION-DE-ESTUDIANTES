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
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { FiltrosMovil } from "@/components/FiltrosMovil";
import { StudentDrawer } from "@/components/StudentDrawer";
import { FacetGroup } from "@/components/ui/FacetGroup";
import { Badge, Button, Card, Select, Skeleton } from "@/components/ui/primitives";
import { api, type Carrera, type EstudianteResumen, type Facultad, type Gestion, type Paginado, type Sede } from "@/lib/api";
import {
  IconoFiltro,
  PREFIJO_FILTRO,
  TEMA_FILTRO,
  borradorVacio,
  esClaveFiltroLado,
  leerBorrador,
  paramsDeBorrador,
  type BorradorFiltros,
  type ClaveFiltroLado,
} from "@/lib/filtros-tema";
import { cn, fmtNum, parseList, removeFromList, titleCase, toggleInList } from "@/lib/format";
import { useUrlFiltros } from "@/lib/url-estado";

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

const PAGE_SIZES = [100, 300, 500, 1000] as const;



type SortKey = "relevancia" | "nombre" | "registro" | "gestion" | "carrera" | "facultad" | "ci";

export function SearchView() {
  const pathname = usePathname();
  const { get, setParams, qs } = useUrlFiltros(pathname);
  const mountId = useId();

  // El texto del input es la fuente de verdad; la URL y la consulta se actualizan con debounce.
  const [texto, setTexto] = useState(() => get("q"));

  const [res, setRes] = useState<Paginado<EstudianteResumen> | null>(null);
  const [resKey, setResKey] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; msg: string } | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [facultades, setFacultades] = useState<Facultad[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [verFiltros, setVerFiltros] = useState(false);
  const [borrador, setBorrador] = useState<BorradorFiltros | null>(null);
  const [carrerasBorrador, setCarrerasBorrador] = useState<Carrera[]>([]);
  const [totalBorrador, setTotalBorrador] = useState<number | null>(null);
  const [conteoError, setConteoError] = useState(false);
  const [conteoCargando, setConteoCargando] = useState(false);
  const [openSignal, setOpenSignal] = useState<{ open: boolean; seq: number }>({ open: true, seq: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

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

  const facultadBorrador = borrador?.facultad_id.join(",") ?? "";
  useEffect(() => {
    if (!verFiltros || !borrador) return;
    const ctrl = new AbortController();
    api<Carrera[]>("/api/catalogos/carreras", { facultad_id: facultadBorrador || undefined }, ctrl.signal)
      .then(setCarrerasBorrador)
      .catch((e) => {
        if (e.name !== "AbortError") setCarrerasBorrador([]);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verFiltros, facultadBorrador]);

  const claveBorrador = borrador
    ? ["facultad_id", "carrera_id", "sede_id", "gestion", "sexo", "activo", "fuente"]
        .map((k) => `${k}=${borrador[k as ClaveFiltroLado].join(",")}`)
        .join("&")
    : "";
  useEffect(() => {
    if (!verFiltros || !borrador) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setConteoCargando(true);
      const params: Record<string, string> = { page_size: "1" };
      for (const [k, v] of Object.entries(paramsDeBorrador(borrador))) {
        if (v) params[k] = v;
      }
      const qAplicada = get("q").trim();
      if (qAplicada) params.q = qAplicada;
      api<Paginado<EstudianteResumen>>("/api/estudiantes", params, ctrl.signal)
        .then((r) => {
          setTotalBorrador(r.total);
          setConteoError(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setConteoError(true);
            setTotalBorrador(null);
          }
        })
        .finally(() => setConteoCargando(false));
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verFiltros, claveBorrador, qs, get]);

  // Debounce de la URL y de la búsqueda: el input no espera a la red ni al router.
  useEffect(() => {
    const trimmed = texto.trim();
    const timer = window.setTimeout(() => {
      const qActual = new URLSearchParams(window.location.search).get("q") ?? "";
      if (trimmed !== qActual) setParams({ q: trimmed || null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [texto, setParams]);

  // Atrás / adelante del navegador: sí se admite escribir el q de la URL en el input.
  useEffect(() => {
    const onPop = () => {
      setTexto(new URLSearchParams(window.location.search).get("q") ?? "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const consultaSeq = useRef(0);
  const queryKey = FILTROS.map((k) => `${k}=${get(k)}`).join("&");
  useEffect(() => {
    const seq = ++consultaSeq.current;
    const ctrl = new AbortController();
    const params: Record<string, string> = {};
    for (const k of FILTROS) if (get(k)) params[k] = get(k);
    if (!params.page_size) params.page_size = "1000";
    const t0 = performance.now();
    api<Paginado<EstudianteResumen>>("/api/estudiantes", params, ctrl.signal)
      .then((r) => {
        if (seq !== consultaSeq.current) return;
        setRes(r);
        setResKey(queryKey);
        setError(null);
        setMs(Math.round(performance.now() - t0));
      })
      .catch((e) => {
        if (e.name !== "AbortError" && seq === consultaSeq.current) {
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
  const toggleSort = useCallback(
    (k: SortKey) => {
      if (sort === k) setParams({ sort: k, order: order === "asc" ? "desc" : "asc" });
      else setParams({ sort: k, order: "asc" });
    },
    [sort, order, setParams],
  );

  const facultadIds = get("facultad_id");
  const carreraIds = get("carrera_id");
  const sedeIds = get("sede_id");
  const gestionIds = get("gestion");
  const sexoIds = get("sexo");
  const activoIds = get("activo");
  const fuenteId = get("fuente");
  const selFacultades = useMemo(() => parseList(facultadIds), [facultadIds]);
  const selCarreras = useMemo(() => parseList(carreraIds), [carreraIds]);
  const selSedes = useMemo(() => parseList(sedeIds), [sedeIds]);
  const selGestiones = useMemo(() => parseList(gestionIds), [gestionIds]);
  const selSexos = useMemo(() => parseList(sexoIds), [sexoIds]);
  const selActivos = useMemo(() => parseList(activoIds), [activoIds]);
  const selFuente = useMemo(() => (fuenteId ? [fuenteId] : []), [fuenteId]);

  const cargando = resKey !== queryKey;
  const errorMsg = error && error.key === queryKey ? error.msg : null;
  const hayFiltros = FILTROS.some((k) => !["sort", "order", "page", "page_size"].includes(k) && get(k));
  const page = Number(get("page") || 1);
  const pageSizeActual = PAGE_SIZES.includes(Number(get("page_size")) as (typeof PAGE_SIZES)[number])
    ? get("page_size")
    : "1000";
  const detalle = get("r");

  const chips = useMemo(() => {
    const c: { id: string; k: string; v: string; label: string; prefix: string; clave: ClaveFiltroLado }[] = [];
    for (const v of selFacultades) {
      c.push({
        id: `facultad_id:${v}`,
        k: "facultad_id",
        v,
        clave: "facultad_id",
        prefix: PREFIJO_FILTRO.facultad_id,
        label: titleCase(facultades.find((f) => String(f.id) === v)?.nombre ?? `Facultad #${v}`),
      });
    }
    for (const v of selCarreras) {
      c.push({
        id: `carrera_id:${v}`,
        k: "carrera_id",
        v,
        clave: "carrera_id",
        prefix: PREFIJO_FILTRO.carrera_id,
        label: titleCase(carreras.find((x) => String(x.id) === v)?.nombre ?? `Carrera #${v}`),
      });
    }
    for (const v of selSedes) {
      c.push({
        id: `sede_id:${v}`,
        k: "sede_id",
        v,
        clave: "sede_id",
        prefix: PREFIJO_FILTRO.sede_id,
        label: titleCase(sedes.find((s) => String(s.id) === v)?.nombre ?? `Sede #${v}`),
      });
    }
    for (const v of selGestiones) {
      c.push({ id: `gestion:${v}`, k: "gestion", v, clave: "gestion", prefix: PREFIJO_FILTRO.gestion, label: `Gestión ${v}` });
    }
    for (const v of selSexos) {
      c.push({ id: `sexo:${v}`, k: "sexo", v, clave: "sexo", prefix: PREFIJO_FILTRO.sexo, label: v === "M" ? "Masculino" : "Femenino" });
    }
    for (const v of selActivos) {
      c.push({ id: `activo:${v}`, k: "activo", v, clave: "activo", prefix: PREFIJO_FILTRO.activo, label: v === "true" ? "Activos" : "Inactivos" });
    }
    for (const v of selFuente) {
      c.push({
        id: `fuente:${v}`,
        k: "fuente",
        v,
        clave: "fuente",
        prefix: PREFIJO_FILTRO.fuente,
        label: { web: "Con datos web", solo_web: "Nuevos (solo web)", solo_pdf: "Solo lista PDF" }[v] ?? v,
      });
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, facultades, carreras, sedes]);

  const limpiarSidebar = useCallback(
    () =>
      setParams({
        facultad_id: null,
        carrera_id: null,
        sede_id: null,
        gestion: null,
        sexo: null,
        activo: null,
        fuente: null,
      }),
    [setParams],
  );

  const onToggleOpen = useCallback(() => {
    setOpenSignal((st) => ({ open: !st.open, seq: st.seq + 1 }));
  }, []);

  const limpiarTodo = useCallback(() => {
    setTexto("");
    setParams({
      q: null,
      facultad_id: null,
      carrera_id: null,
      sede_id: null,
      gestion: null,
      sexo: null,
      activo: null,
      fuente: null,
      sort: null,
      order: null,
      page: null,
      page_size: null,
    });
  }, [setParams]);

  const abrirFiltros = useCallback(() => {
    setBorrador(leerBorrador(get));
    setTotalBorrador(res?.total ?? null);
    setConteoError(false);
    setCarrerasBorrador(carreras);
    setVerFiltros(true);
  }, [get, res, carreras]);

  const cerrarFiltros = useCallback(() => {
    setVerFiltros(false);
    setBorrador(null);
    setConteoCargando(false);
  }, []);

  const aplicarFiltros = useCallback(() => {
    if (borrador) setParams(paramsDeBorrador(borrador));
    setVerFiltros(false);
    setBorrador(null);
    setConteoCargando(false);
  }, [borrador, setParams]);

  const limpiarBorrador = useCallback(() => {
    setBorrador(borradorVacio());
  }, []);

  const setBorradorDesdeParams = useCallback(
    (cambios: Record<string, string | null>) => {
      setBorrador((b) => {
        if (!b) return b;
        const n: BorradorFiltros = { ...b };
        for (const [k, v] of Object.entries(cambios)) {
          if (esClaveFiltroLado(k)) n[k] = parseList(v);
        }
        if ("facultad_id" in cambios && n.facultad_id.length > 0) {
          const cat = carrerasBorrador.length > 0 ? carrerasBorrador : carreras;
          n.carrera_id = n.carrera_id.filter((id) => {
            const c = cat.find((x) => String(x.id) === id);
            return c ? n.facultad_id.includes(String(c.facultad_id)) : false;
          });
        }
        return n;
      });
    },
    [carreras, carrerasBorrador],
  );

  const onSelectRegistro = useCallback(
    (r: string) => {
      setParams({ r }, false);
    },
    [setParams],
  );

  const registrosVisibles = useMemo(() => res?.data.map((d) => d.registro) ?? [], [res]);

  return (
    <div className="space-y-4" data-testid="busqueda-raiz" data-mount-id={mountId}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <FiltrosLaterales
          chipsLength={chips.length}
          openSignal={openSignal}
          onToggleOpen={onToggleOpen}
          onLimpiar={limpiarSidebar}
          facultades={facultades}
          carreras={carreras}
          sedes={sedes}
          gestiones={gestiones}
          selFacultades={selFacultades}
          selCarreras={selCarreras}
          selSedes={selSedes}
          selGestiones={selGestiones}
          selSexos={selSexos}
          selActivos={selActivos}
          selFuente={selFuente}
          fuenteActual={get("fuente")}
          onSet={setParams}
        />

        {/* Columna principal: buscador + tabla */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-[calc(100dvh-160px)]">
          <Card className="p-3 sm:p-3.5 max-lg:sticky max-lg:top-[calc(env(safe-area-inset-top,0px)+6.05rem)] max-lg:z-30 max-lg:-mx-4 max-lg:-mt-4 max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:shadow-[0_1px_0_#E4E6EA]">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={18}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6370]"
                />
                <input
                  ref={inputRef}
                  data-testid="busqueda-input"
                  data-mount-id={mountId}
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
                onClick={abrirFiltros}
                aria-expanded={verFiltros}
                aria-haspopup="dialog"
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium lg:hidden",
                  chips.length > 0
                    ? "border-[#166534] bg-[#F0F7F2] text-[#166534]"
                    : "border-[#E4E6EA] bg-white text-[#111827] hover:bg-[#F4F5F6]",
                )}
              >
                <SlidersHorizontal size={16} aria-hidden />
                <span>Filtros{chips.length > 0 ? ` (${chips.length})` : ""}</span>
              </button>
            </div>

            {chips.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 border-t border-[#EFEFF2] pt-2.5 max-lg:no-scrollbar max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1 lg:flex-wrap">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setParams({
                        [c.k]: c.k === "fuente" ? null : removeFromList(parseList(get(c.k)), c.v),
                      })
                    }
                    aria-label={`Quitar filtro ${c.prefix}: ${c.label}`}
                    className="inline-flex min-h-8 max-w-[16rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:opacity-80 lg:max-w-full lg:rounded"
                    style={{
                      backgroundColor: TEMA_FILTRO[c.clave].suave,
                      borderColor: TEMA_FILTRO[c.clave].borde,
                      color: TEMA_FILTRO[c.clave].tinta,
                    }}
                  >
                    <span className="truncate">
                      <span className="lg:hidden">{c.prefix}: </span>
                      {c.label}
                    </span>
                    <X size={12} weight="bold" aria-hidden />
                  </button>
                ))}
                {hayFiltros && (
                  <button
                    type="button"
                    onClick={limpiarTodo}
                    className="min-h-8 shrink-0 cursor-pointer whitespace-nowrap px-2 text-xs font-medium text-[#4B5563] underline-offset-2 hover:text-[#111827] hover:underline"
                  >
                    Quitar todo
                  </button>
                )}
              </div>
            )}
          </Card>

          <PanelResultados
            res={res}
            cargando={cargando}
            ms={ms}
            errorMsg={errorMsg}
            sort={sort}
            order={order}
            hayQ={Boolean(get("q"))}
            pageSizeActual={pageSizeActual}
            page={page}
            detalle={detalle}
            hayFiltros={hayFiltros}
            onSetParams={setParams}
            onSort={toggleSort}
            onSelectRegistro={onSelectRegistro}
            onLimpiarTodo={limpiarTodo}
          />

        </div>
      </div>

      <StudentDrawer
        registro={detalle || null}
        registrosVisibles={registrosVisibles}
        onSelectRegistro={onSelectRegistro}
        onClose={() => setParams({ r: null }, false)}
      />

      <FiltrosMovil
        open={verFiltros}
        total={conteoError ? null : totalBorrador}
        cargando={conteoCargando}
        onClose={cerrarFiltros}
        onClear={limpiarBorrador}
        onApply={aplicarFiltros}
      >
        {borrador && (
          <GruposFiltro
            facultades={facultades}
            carreras={carrerasBorrador}
            sedes={sedes}
            gestiones={gestiones}
            selFacultades={borrador.facultad_id}
            selCarreras={borrador.carrera_id}
            selSedes={borrador.sede_id}
            selGestiones={borrador.gestion}
            selSexos={borrador.sexo}
            selActivos={borrador.activo}
            selFuente={borrador.fuente}
            fuenteActual={borrador.fuente[0] ?? ""}
            onSet={setBorradorDesdeParams}
            defaultOpenFacultad
            defaultOpenOtros={false}
          />
        )}
      </FiltrosMovil>
    </div>
  );
}

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getDesktopSnapshot() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function getDesktopServerSnapshot() {
  return true;
}

const ResultadosLista = memo(function ResultadosLista({
  res,
  cargando,
  detalle,
  sort,
  order,
  hayFiltros,
  onSort,
  onSelectRegistro,
  onLimpiarTodo,
}: {
  res: Paginado<EstudianteResumen> | null;
  cargando: boolean;
  detalle: string;
  sort: SortKey;
  order: string;
  hayFiltros: boolean;
  onSort: (k: SortKey) => void;
  onSelectRegistro: (registro: string) => void;
  onLimpiarTodo: () => void;
}) {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
  const sinResultados = Boolean(res && res.data.length === 0 && !cargando);

  return (
    <div className="flex flex-1 flex-col">
      {!isDesktop ? (
        /* Teléfono / tablet: tarjetas */
        <ul className="grid grid-cols-1 divide-y divide-[#EFEFF2] md:grid-cols-2 md:gap-3 md:divide-y-0 md:p-3">
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
                    onClick={() => onSelectRegistro(e.registro)}
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
                        <dd className="font-mono text-[13px] tabular-nums text-[#111827]">{e.gestion_ingreso ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[#5A6370]">Sede</dt>
                        <dd className="truncate text-[13px] text-[#111827]">{titleCase(e.sede) || "—"}</dd>
                      </div>
                    </dl>
                  </button>
                </li>
              ))}
        </ul>
      ) : (
        /* Escritorio: tabla aprovechando el ancho disponible */
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E4E6EA] bg-[#F4F5F6] text-left text-xs text-[#5A6370]">
              <tr>
                <Th k="registro" sort={sort} order={order} onSort={onSort}>
                  Registro
                </Th>
                <Th k="nombre" sort={sort} order={order} onSort={onSort}>
                  Nombre completo
                </Th>
                <Th k="ci" sort={sort} order={order} onSort={onSort}>
                  CI
                </Th>
                <Th k="carrera" sort={sort} order={order} onSort={onSort}>
                  Carrera / Facultad
                </Th>
                <Th k="gestion" sort={sort} order={order} onSort={onSort}>
                  Gestión
                </Th>
                <th className="px-4 py-2.5 font-medium">Sede</th>
                <th className="px-4 py-2.5 font-medium">Fuente</th>
              </tr>
            </thead>
            {!sinResultados && (
              <tbody className="divide-y divide-[#EFEFF2]">
                {cargando && !res
                  ? Array.from({ length: 14 }).map((_, i) => (
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
                        onClick={() => onSelectRegistro(e.registro)}
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            onSelectRegistro(e.registro);
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
              </tbody>
            )}
          </table>
        </div>
      )}

      {sinResultados && (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center text-sm text-[#5A6370]">
          <p className="font-medium text-[#111827]">Sin resultados para esta búsqueda</p>
          <p className="mt-1 text-xs text-[#5A6370]">Pruebe desmarcando alguno de los filtros seleccionados.</p>
          {hayFiltros && (
            <Button className="mt-4" onClick={onLimpiarTodo}>
              Restablecer filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
});


const GruposFiltro = memo(function GruposFiltro({
  facultades,
  carreras,
  sedes,
  gestiones,
  selFacultades,
  selCarreras,
  selSedes,
  selGestiones,
  selSexos,
  selActivos,
  selFuente,
  fuenteActual,
  onSet,
  openSignal,
  defaultOpenFacultad = true,
  defaultOpenOtros = true,
}: {
  facultades: Facultad[];
  carreras: Carrera[];
  sedes: Sede[];
  gestiones: Gestion[];
  selFacultades: string[];
  selCarreras: string[];
  selSedes: string[];
  selGestiones: string[];
  selSexos: string[];
  selActivos: string[];
  selFuente: string[];
  fuenteActual: string;
  onSet: (cambios: Record<string, string | null>) => void;
  openSignal?: { open: boolean; seq: number };
  defaultOpenFacultad?: boolean;
  defaultOpenOtros?: boolean;
}) {
  return (
    <div className="space-y-5">
      <FacetGroup
        title="Facultad"
        tema={TEMA_FILTRO.facultad_id}
        icono={<IconoFiltro grupo="facultad_id" />}
        searchable
        searchPlaceholder="Escribir facultad..."
        openSignal={openSignal}
        defaultOpen={defaultOpenFacultad}
        selected={selFacultades}
        onClearGroup={() => onSet({ facultad_id: null })}
        onToggle={(v) => onSet({ facultad_id: toggleInList(selFacultades, v) })}
        options={facultades
          .filter((f) => f.total > 0 || selFacultades.includes(String(f.id)))
          .map((f) => ({ value: String(f.id), label: titleCase(f.nombre), count: f.total }))}
      />

      <FacetGroup
        title="Carrera"
        tema={TEMA_FILTRO.carrera_id}
        icono={<IconoFiltro grupo="carrera_id" />}
        searchable
        searchPlaceholder="Escribir carrera..."
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selCarreras}
        onClearGroup={() => onSet({ carrera_id: null })}
        onToggle={(v) => onSet({ carrera_id: toggleInList(selCarreras, v) })}
        options={carreras
          .filter((c) => c.total > 0 || selCarreras.includes(String(c.id)))
          .map((c) => ({ value: String(c.id), label: titleCase(c.nombre), count: c.total }))}
      />

      <FacetGroup
        title="Gestión"
        tema={TEMA_FILTRO.gestion}
        icono={<IconoFiltro grupo="gestion" />}
        searchable
        searchPlaceholder="Ej: 2024..."
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selGestiones}
        onClearGroup={() => onSet({ gestion: null })}
        onToggle={(v) => onSet({ gestion: toggleInList(selGestiones, v) })}
        options={gestiones.map((g) => ({ value: String(g.gestion), label: String(g.gestion), count: g.total }))}
      />

      <FacetGroup
        title="Sede"
        tema={TEMA_FILTRO.sede_id}
        icono={<IconoFiltro grupo="sede_id" />}
        searchable
        searchPlaceholder="Escribir sede..."
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selSedes}
        onClearGroup={() => onSet({ sede_id: null })}
        onToggle={(v) => onSet({ sede_id: toggleInList(selSedes, v) })}
        options={sedes
          .filter((x) => x.total > 0 || selSedes.includes(String(x.id)))
          .map((x) => ({ value: String(x.id), label: titleCase(x.nombre), count: x.total }))}
      />

      <FacetGroup
        title="Género"
        tema={TEMA_FILTRO.sexo}
        icono={<IconoFiltro grupo="sexo" />}
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selSexos}
        onClearGroup={() => onSet({ sexo: null })}
        onToggle={(v) => onSet({ sexo: toggleInList(selSexos, v) })}
        options={[
          { value: "M", label: "Masculino" },
          { value: "F", label: "Femenino" },
        ]}
      />

      <FacetGroup
        title="Estado"
        tema={TEMA_FILTRO.activo}
        icono={<IconoFiltro grupo="activo" />}
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selActivos}
        onClearGroup={() => onSet({ activo: null })}
        onToggle={(v) => onSet({ activo: toggleInList(selActivos, v) })}
        options={[
          { value: "true", label: "Activos" },
          { value: "false", label: "Inactivos" },
        ]}
      />

      <FacetGroup
        title="Fuente"
        tema={TEMA_FILTRO.fuente}
        icono={<IconoFiltro grupo="fuente" />}
        openSignal={openSignal}
        defaultOpen={defaultOpenOtros}
        selected={selFuente}
        onClearGroup={() => onSet({ fuente: null })}
        onToggle={(v) => onSet({ fuente: fuenteActual === v ? null : v })}
        options={[
          { value: "web", label: "Con datos web" },
          { value: "solo_web", label: "Nuevos (solo web)" },
          { value: "solo_pdf", label: "Solo lista PDF" },
        ]}
      />
    </div>
  );
});

type SetParams = (cambios: Record<string, string | null>, resetPage?: boolean) => void;

const FiltrosLaterales = memo(function FiltrosLaterales({
  chipsLength,
  openSignal,
  onToggleOpen,
  onLimpiar,
  facultades,
  carreras,
  sedes,
  gestiones,
  selFacultades,
  selCarreras,
  selSedes,
  selGestiones,
  selSexos,
  selActivos,
  selFuente,
  fuenteActual,
  onSet,
}: {
  chipsLength: number;
  openSignal: { open: boolean; seq: number };
  onToggleOpen: () => void;
  onLimpiar: () => void;
  facultades: Facultad[];
  carreras: Carrera[];
  sedes: Sede[];
  gestiones: Gestion[];
  selFacultades: string[];
  selCarreras: string[];
  selSedes: string[];
  selGestiones: string[];
  selSexos: string[];
  selActivos: string[];
  selFuente: string[];
  fuenteActual: string;
  onSet: SetParams;
}) {
  return (
    <aside
      aria-label="Filtros de búsqueda"
      data-testid="filtros-laterales"
      className="hidden w-full shrink-0 lg:sticky lg:top-[72px] lg:block lg:w-[272px] xl:w-[292px] 2xl:w-[308px]"
    >
      <Card className="relative p-4 lg:max-h-[calc(100dvh-104px)] lg:overflow-y-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#111827]">Filtros</h2>
            {chipsLength > 0 && (
              <span className="rounded bg-[#F0F7F2] px-1.5 py-0.5 font-mono text-xs font-medium text-[#166534] ring-1 ring-inset ring-[#C4DEC9]">
                {chipsLength}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleOpen}
              className="cursor-pointer text-xs font-medium text-[#5A6370] hover:text-[#111827] hover:underline"
            >
              {openSignal.open ? "Colapsar" : "Desplegar"}
            </button>
            {chipsLength > 0 && (
              <button
                type="button"
                onClick={onLimpiar}
                className="cursor-pointer text-xs font-medium text-[#166534] hover:underline"
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>

        <GruposFiltro
          facultades={facultades}
          carreras={carreras}
          sedes={sedes}
          gestiones={gestiones}
          selFacultades={selFacultades}
          selCarreras={selCarreras}
          selSedes={selSedes}
          selGestiones={selGestiones}
          selSexos={selSexos}
          selActivos={selActivos}
          selFuente={selFuente}
          fuenteActual={fuenteActual}
          onSet={onSet}
          openSignal={openSignal}
        />
      </Card>
    </aside>
  );
});

const PanelResultados = memo(function PanelResultados({
  res,
  cargando,
  ms,
  errorMsg,
  sort,
  order,
  hayQ,
  pageSizeActual,
  page,
  detalle,
  hayFiltros,
  onSetParams,
  onSort,
  onSelectRegistro,
  onLimpiarTodo,
}: {
  res: Paginado<EstudianteResumen> | null;
  cargando: boolean;
  ms: number | null;
  errorMsg: string | null;
  sort: SortKey;
  order: string;
  hayQ: boolean;
  pageSizeActual: string;
  page: number;
  detalle: string;
  hayFiltros: boolean;
  onSetParams: SetParams;
  onSort: (k: SortKey) => void;
  onSelectRegistro: (registro: string) => void;
  onLimpiarTodo: () => void;
}) {
  return (
    <Card className="relative flex flex-1 flex-col overflow-hidden" data-testid="resultados">
      {cargando && res && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#166534]" aria-hidden />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6EA] px-4 py-2.5 sm:px-5">
        <p className="text-xs text-[#4B5563] sm:text-sm">
          {res ? (
            <>
              <span className="font-mono font-semibold tabular-nums text-[#111827]">{fmtNum(res.total)}</span> estudiantes
              {res.total > 0 && (
                <span className="hidden text-xs text-[#5A6370] sm:inline">
                  {" "}
                  (mostrando {fmtNum(res.data.length)})
                </span>
              )}
              {cargando ? (
                <span className="ml-2 text-xs font-medium text-[#166534]" data-testid="resultados-actualizando">
                  Actualizando...
                </span>
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
            <Select
              aria-label="Ordenar por"
              className="w-auto"
              value={sort}
              onChange={(e) => onSetParams({ sort: e.target.value, order: "asc" })}
            >
              {hayQ && <option value="relevancia">Relevancia</option>}
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
            onClick={() => onSetParams({ sort, order: order === "asc" ? "desc" : "asc" })}
          >
            {order === "desc" ? <ArrowDown size={15} aria-hidden /> : <ArrowUp size={15} aria-hidden />}
          </Button>
          <span className="hidden sm:inline">Filas</span>
          <Select
            aria-label="Filas por página"
            className="w-24"
            value={pageSizeActual}
            onChange={(e) => onSetParams({ page_size: e.target.value === "1000" ? null : e.target.value })}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {errorMsg ? (
        <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
          <p className="font-medium text-[#991B1B]">No se pudo consultar la API</p>
          <p className="mt-1 text-sm text-[#5A6370]">{errorMsg}. Verifique que el backend esté activo.</p>
        </div>
      ) : (
        <ResultadosLista
          res={res}
          cargando={cargando}
          detalle={detalle}
          sort={sort}
          order={order}
          hayFiltros={hayFiltros}
          onSort={onSort}
          onSelectRegistro={onSelectRegistro}
          onLimpiarTodo={onLimpiarTodo}
        />
      )}

      {res && res.pages > 1 && (
        <div className="mt-auto flex flex-col gap-2 border-t border-[#E4E6EA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-center text-xs text-[#5A6370] sm:text-left sm:text-sm">
            Página <span className="font-mono font-medium text-[#111827]">{fmtNum(page)}</span> de{" "}
            <span className="font-mono">{fmtNum(res.pages)}</span>
          </p>
          <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-1.5 sm:flex">
            <Button aria-label="Primera página" disabled={page <= 1} onClick={() => onSetParams({ page: null }, false)}>
              <CaretDoubleLeft size={14} aria-hidden />
            </Button>
            <Button
              disabled={page <= 1}
              onClick={() => onSetParams({ page: page - 1 > 1 ? String(page - 1) : null }, false)}
            >
              <CaretLeft size={14} aria-hidden />
              <span>Anterior</span>
            </Button>
            <Button disabled={page >= res.pages} onClick={() => onSetParams({ page: String(page + 1) }, false)}>
              <span>Siguiente</span>
              <CaretRight size={14} aria-hidden />
            </Button>
            <Button aria-label="Última página" disabled={page >= res.pages} onClick={() => onSetParams({ page: String(res.pages) }, false)}>
              <CaretDoubleRight size={14} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
});

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
