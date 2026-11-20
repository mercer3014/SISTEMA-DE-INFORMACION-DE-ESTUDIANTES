// Cliente de la API. El navegador llama a /api/* en el MISMO origen; el route handler
// src/app/api/[...path]/route.ts reenvía al backend Rust interno (API_INTERNAL_URL) y
// agrega la API_KEY del lado del servidor.

export interface EstudianteResumen {
  registro: string;
  nombre_completo: string;
  ci: string | null;
  sexo: string | null;
  facultad_id: number | null;
  facultad: string | null;
  carrera_id: number | null;
  carrera: string | null;
  sede: string | null;
  gestion_ingreso: number | null;
  activo: boolean | null;
  en_padron: boolean;
  en_web: boolean;
  relevancia: number;
}

export interface Paginado<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface EstudianteDetalle extends Omit<EstudianteResumen, "relevancia"> {
  nombres: string | null;
  apellido_pri: string | null;
  apellido_seg: string | null;
  lugar_ci: string | null;
  fecha_nac: string | null;
  direccion: string | null;
  telefono: string | null;
  celular: string | null;
  plan: string | null;
  carrera_codigo: string | null;
  sede_id: number | null;
  mesa: number | null;
  recinto: string | null;
  recinto_lugar: string | null;
  aula: string | null;
  hab_ci: boolean | null;
  hab_icu_fac: boolean | null;
  hab_ful: boolean | null;
  web_actualizado_at: string | null;
  padron_actualizado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilaPadron {
  fuente: string;
  nro: number | null;
  facultad: string | null;
  carrera: string | null;
  sede: string | null;
  nombre: string;
  mesa: number | null;
  recinto: string | null;
  aula: string | null;
  pagina: number | null;
}

export interface DetalleResponse {
  estudiante: EstudianteDetalle;
  padron: FilaPadron[];
  consultas_web: number;
}

export interface Facultad {
  id: number;
  nombre: string;
  total: number;
}
export interface Carrera {
  id: number;
  facultad_id: number;
  nombre: string;
  codigo: string | null;
  total: number;
}
export interface Sede {
  id: number;
  nombre: string;
  total: number;
}
export interface Gestion {
  gestion: number;
  total: number;
}
export interface Conteo {
  id: number | null;
  etiqueta: string | null;
  total: number;
  con_datos_web: number | null;
}

export interface Stats {
  resumen: {
    total: number;
    en_web: number;
    en_padron: number;
    solo_web: number;
    con_ci: number;
    hombres: number;
    mujeres: number;
    activos?: number;
    inactivos?: number;
    facultades: number;
    sedes: number;
  };
  por_facultad: Conteo[];
  por_carrera: Conteo[];
  por_gestion: Conteo[];
  por_sede: Conteo[];
}

export interface Progreso {
  objetivos: { estado: string; total: number }[];
  bloques: { estado: string; total: number }[];
  consultas_ultimos_10_min: number;
  req_por_segundo: number;
  ultima_consulta: string | null;
  corridas: { id: number; modo: string; estado: string; iniciado_en: string; finalizado_en: string | null }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const CATALOGO_CACHE_TTL_MS = 60_000;
const catalogoCache = new Map<string, { exp: number; data: unknown }>();

export async function api<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  signal?: AbortSignal,
): Promise<T> {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const esCatalogo = path.startsWith("/api/catalogos/");
  const cacheKey = url.pathname + url.search;
  if (esCatalogo && typeof window !== "undefined") {
    const hit = catalogoCache.get(cacheKey);
    if (hit && hit.exp > Date.now()) {
      return hit.data as T;
    }
  }

  const res = await fetch(url, {
    signal,
    cache: esCatalogo ? "default" : "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* sin cuerpo */
    }
    throw new ApiError(res.status, msg);
  }
  const data = (await res.json()) as T;
  if (esCatalogo && typeof window !== "undefined") {
    catalogoCache.set(cacheKey, { exp: Date.now() + CATALOGO_CACHE_TTL_MS, data });
  }
  return data;
}
