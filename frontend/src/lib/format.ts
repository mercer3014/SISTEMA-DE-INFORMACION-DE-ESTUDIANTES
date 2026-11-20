export const nf = new Intl.NumberFormat("es-BO");

export function fmtNum(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : nf.format(n);
}

export function fmtFecha(iso: string | null | undefined, conHora = false) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleString("es-BO", conHora
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/La_Paz" }
    : { dateStyle: "medium", timeZone: "America/La_Paz" });
}

export function edad(fechaNac: string | null) {
  if (!fechaNac) return null;
  const n = new Date(fechaNac + "T12:00:00");
  const h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e;
}

const MENORES = new Set(["de", "del", "la", "las", "los", "y", "e", "en", "el", "a", "con", "para", "por"]);

export function titleCase(s: string | null | undefined) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && MENORES.has(w) ? w : w.replace(/^([(\/-]?)([a-záéíóúñü])/, (_, a, b) => a + b.toUpperCase())))
    .join(" ");
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
