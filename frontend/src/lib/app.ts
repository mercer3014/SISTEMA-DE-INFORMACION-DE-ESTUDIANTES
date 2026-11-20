// Nombre visible del sistema: se cambia en un solo lugar (variable NEXT_PUBLIC_APP_NAME,
// que Next.js incrusta al compilar). Por defecto "Estudiantes".
export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME || "Estudiantes").trim();

/** Iniciales para el logo (1-2 letras). */
export const APP_INITIALS = APP_NAME.split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0]!.toUpperCase())
  .join("") || "E";
