// Autenticación HTTP Basic OPCIONAL para todo el sitio (páginas y /api/*).
// En el VPS la autenticación la hace Traefik (middleware basicauth), así que estas
// variables se dejan vacías para no pedir doble login. Se activa sólo si están definidas BASIC_AUTH_USER y BASIC_AUTH_PASSWORD_SHA256
// (hash SHA-256 en hexadecimal de la contraseña; ver README). Para desarrollo también se
// acepta BASIC_AUTH_PASSWORD en texto plano. Se leen en tiempo de ejecución: no se
// incrustan en la imagen.
import { NextResponse, type NextRequest } from "next/server";

const enc = new TextEncoder();

async function sha256Hex(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(txt));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante (para cadenas de igual largo). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function pedirCredenciales() {
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Acceso restringido", charset="UTF-8"' },
  });
}

export async function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const hash = process.env.BASIC_AUTH_PASSWORD_SHA256?.trim().toLowerCase();
  const plano = process.env.BASIC_AUTH_PASSWORD;
  if (!user || (!hash && !plano)) return NextResponse.next();

  // Healthchecks (no exponen datos).
  if (req.nextUrl.pathname === "/healthz" || req.nextUrl.pathname === "/api/health") return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return pedirCredenciales();
  let dec = "";
  try {
    dec = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6).trim()), (c) => c.charCodeAt(0)));
  } catch {
    return pedirCredenciales();
  }
  const i = dec.indexOf(":");
  if (i < 0) return pedirCredenciales();
  const u = dec.slice(0, i);
  const p = dec.slice(i + 1);

  const hashEsperado = hash || (await sha256Hex(plano!));
  const okUser = iguales(await sha256Hex(u), await sha256Hex(user));
  const okPass = iguales(await sha256Hex(p), hashEsperado);
  return okUser && okPass ? NextResponse.next() : pedirCredenciales();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
