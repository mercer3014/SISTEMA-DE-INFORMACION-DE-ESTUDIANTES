# Frontend · Estudiantes (Next.js 16 + React 19 + Tailwind 4)

```bash
cp .env.example .env.local     # API_INTERNAL_URL=http://localhost:8080
npm install
npm run dev                    # http://localhost:3000
npm run build && npm start     # producción (genera también .next/standalone)
```

Páginas: `/` búsqueda (filtros, tabla ordenable/paginada, ficha lateral; el estado vive en la URL),
`/estadisticas` (dashboard), `/scraping` (progreso de la recolección).

* El navegador llama a `/api/*` en el mismo origen; `src/app/api/[...path]/route.ts` reenvía al
  backend Rust (`API_INTERNAL_URL`) y agrega `API_KEY` del lado del servidor.
* `src/proxy.ts` protege todo el sitio con HTTP Basic si `BASIC_AUTH_USER` y
  `BASIC_AUTH_PASSWORD_SHA256` están definidas.
* El nombre visible sale de `NEXT_PUBLIC_APP_NAME` (por defecto "Estudiantes", ver `src/lib/app.ts`).

Vercel: Root Directory `frontend` y las mismas variables (`API_INTERNAL_URL` debe ser una URL de la
API accesible desde Vercel, idealmente con `API_KEY`). Docker: ver `Dockerfile` y el README raíz.
