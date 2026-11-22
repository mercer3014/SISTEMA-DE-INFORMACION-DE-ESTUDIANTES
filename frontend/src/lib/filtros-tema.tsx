import type { CSSProperties } from "react";
import {
  BookOpen,
  Buildings,
  CalendarBlank,
  CheckCircle,
  MapPin,
  Stack,
  Users,
} from "@phosphor-icons/react";

import { parseList } from "@/lib/format";

/** Claves de filtro que viven en el panel lateral / la hoja móvil. */
export type ClaveFiltroLado =
  | "facultad_id"
  | "carrera_id"
  | "sede_id"
  | "gestion"
  | "sexo"
  | "activo"
  | "fuente";

export type BorradorFiltros = Record<ClaveFiltroLado, string[]>;

/** Paleta suave, contrastada (texto ≥ AA) y afín a Directorio Claro. */
export interface TemaFiltro {
  /** Texto del título, chips y etiquetas seleccionadas. */
  tinta: string;
  /** Barra, icono y casilla marcada. */
  acento: string;
  /** Fondo del badge del icono. */
  iconoFondo: string;
  /** Fondo de chip / contador. */
  suave: string;
  /** Borde de chip / contador. */
  borde: string;
}

export const TEMA_FILTRO: Record<ClaveFiltroLado, TemaFiltro> = {
  facultad_id: {
    tinta: "#14532D",
    acento: "#166534",
    iconoFondo: "#E6F4EA",
    suave: "#F0F7F2",
    borde: "#C4DEC9",
  },
  carrera_id: {
    tinta: "#163652",
    acento: "#1E4B7A",
    iconoFondo: "#E6EEF6",
    suave: "#EEF3F8",
    borde: "#C5D4E6",
  },
  gestion: {
    tinta: "#6B4410",
    acento: "#8A5A16",
    iconoFondo: "#F3EBD9",
    suave: "#F7F1E6",
    borde: "#E4D3B0",
  },
  sede_id: {
    tinta: "#0C5052",
    acento: "#0F6A6D",
    iconoFondo: "#DDF0F0",
    suave: "#E8F4F4",
    borde: "#B7D6D6",
  },
  sexo: {
    tinta: "#452E68",
    acento: "#5C3E8A",
    iconoFondo: "#EDE6F5",
    suave: "#F3EEF8",
    borde: "#D4C8E6",
  },
  activo: {
    tinta: "#2E3C59",
    acento: "#3D4F75",
    iconoFondo: "#E6E9F2",
    suave: "#EEF0F6",
    borde: "#C5CDE0",
  },
  fuente: {
    tinta: "#6A3725",
    acento: "#8B4A32",
    iconoFondo: "#F3E6E0",
    suave: "#F7EEE9",
    borde: "#E2C8BB",
  },
};

export const PREFIJO_FILTRO: Record<ClaveFiltroLado, string> = {
  facultad_id: "Facultad",
  carrera_id: "Carrera",
  sede_id: "Sede",
  gestion: "Gestión",
  sexo: "Género",
  activo: "Estado",
  fuente: "Fuente",
};

export function IconoFiltro({
  grupo,
  size = 15,
}: {
  grupo: ClaveFiltroLado;
  size?: number;
}) {
  const p = { size, weight: "duotone" as const, "aria-hidden": true };
  switch (grupo) {
    case "facultad_id":
      return <Buildings {...p} />;
    case "carrera_id":
      return <BookOpen {...p} />;
    case "gestion":
      return <CalendarBlank {...p} />;
    case "sede_id":
      return <MapPin {...p} />;
    case "sexo":
      return <Users {...p} />;
    case "activo":
      return <CheckCircle {...p} />;
    case "fuente":
      return <Stack {...p} />;
  }
}

export function estiloTema(tema: TemaFiltro): CSSProperties {
  return {
    "--filtro-tinta": tema.tinta,
    "--filtro-acento": tema.acento,
    "--filtro-icono-fondo": tema.iconoFondo,
    "--filtro-suave": tema.suave,
    "--filtro-borde": tema.borde,
  } as CSSProperties;
}

export function borradorVacio(): BorradorFiltros {
  return {
    facultad_id: [],
    carrera_id: [],
    sede_id: [],
    gestion: [],
    sexo: [],
    activo: [],
    fuente: [],
  };
}

export function leerBorrador(get: (k: string) => string): BorradorFiltros {
  return {
    facultad_id: parseList(get("facultad_id")),
    carrera_id: parseList(get("carrera_id")),
    sede_id: parseList(get("sede_id")),
    gestion: parseList(get("gestion")),
    sexo: parseList(get("sexo")),
    activo: parseList(get("activo")),
    fuente: get("fuente") ? [get("fuente")] : [],
  };
}

export function paramsDeBorrador(b: BorradorFiltros): Record<string, string | null> {
  return {
    facultad_id: b.facultad_id.join(",") || null,
    carrera_id: b.carrera_id.join(",") || null,
    sede_id: b.sede_id.join(",") || null,
    gestion: b.gestion.join(",") || null,
    sexo: b.sexo.join(",") || null,
    activo: b.activo.join(",") || null,
    fuente: b.fuente[0] ?? null,
  };
}

export function esClaveFiltroLado(k: string): k is ClaveFiltroLado {
  return k in TEMA_FILTRO;
}
