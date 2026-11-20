// Healthcheck del contenedor: no depende de la API ni de la BD (el frontend debe
// seguir vivo aunque la API aún no esté lista) y no expone datos.
export function GET() {
  return Response.json({ ok: true });
}
