// Proxy same-origin hacia la API Rust interna.
// El navegador sólo habla con /api/* de este mismo sitio; aquí se reenvía la petición a
// API_INTERNAL_URL (p. ej. http://estudiantes-api:8080) agregando el header x-api-key.
// Así la API nunca queda expuesta a Internet y API_KEY nunca llega al navegador.
import type { NextRequest } from "next/server";

const API_INTERNAL_URL = () => (process.env.API_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");

const REENVIAR = ["content-type", "cache-control", "etag", "last-modified"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const destino = `${API_INTERNAL_URL()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.API_KEY;
  if (key) headers["x-api-key"] = key;

  let res: Response;
  try {
    res = await fetch(destino, { headers, cache: "no-store", signal: req.signal });
  } catch {
    return Response.json({ error: "La API no está disponible" }, { status: 502 });
  }
  const out = new Headers();
  for (const h of REENVIAR) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}
