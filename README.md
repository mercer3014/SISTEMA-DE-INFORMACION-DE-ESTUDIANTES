# Estudiantes · Sistema de búsqueda de estudiantes

Recolecta datos de estudiantes desde una **fuente web** (consulta por número de registro) y una
**lista PDF** de referencia, los centraliza en **PostgreSQL** y los expone con una **API en Rust** y una
**interfaz web en Next.js/React** para buscar al instante por **nombre, registro, carnet (CI),
facultad, carrera, sede o gestión**.

| Fuente | Rol | Cómo se obtiene |
|---|---|---|
| Fuente web (consulta de registro) | **Principal** (CI, fecha de nacimiento, sexo, teléfono, dirección, carrera, plan…) | Spider **Scrapy** + algoritmo de descubrimiento de rangos |
| Lista PDF | Semilla para descubrir la numeración y datos secundarios (mesa, recinto, habilitaciones) | `pdfplumber` → CSV → `COPY` |

> Las capturas de pantalla (`docs/screenshots/`) muestran datos personales reales: se guardan sólo
> en la copia local y **no** se versionan.

El nombre visible ("Estudiantes") se cambia en un solo lugar: `NEXT_PUBLIC_APP_NAME`
(`frontend/src/lib/app.ts`).

## Arquitectura

```
                         ┌──────────────────── VPS · Docker Swarm ────────────────────┐
 navegador               │                                                             │
 HTTPS ──▶ Traefik ─────────▶ estudiantes-frontend (Next.js :3000)                      │
 (basic auth)            │      │ /api/*  (proxy same-origin + x-api-key)              │
                         │      ▼                                                       │
                         │   estudiantes-api (Rust/Axum :8080) ──▶ estudiantes-db       │
                         │                                         (PostgreSQL 17,     │
                         │   estudiantes-scraper (Scrapy) ────────▶  esquema padron)    │
                         │   estudiantes-migrate (one-shot) ──────▶                     │
                         └─────────────────────────────────────────────────────────────┘
```
La API y la BD sólo están en la red interna `estudiantes-internal`; el único servicio publicado es
el frontend. El navegador llama a `/api/*` del mismo dominio y Next.js reenvía al backend
(`API_INTERNAL_URL`) agregando `API_KEY` del lado del servidor.

## Estructura

```
.
├── backend/            API REST en Rust (Axum + SQLx), Dockerfile
├── database/           migrations/0001..0008.sql, migrate.sh, README.md
├── scraper/            Proyecto Scrapy + ingesta del PDF (Python), docker-loop.sh, Dockerfile
│   ├── uagrm_scraper/  settings, pipelines, middlewares (back-off), planner.py, spiders/registro_web.py
│   ├── pdf_ingest/     parse_padron.py (PDF → CSV), load_padron.py (CSV → PostgreSQL)
│   └── common/         db.py, registro.py (dígito verificador)
├── frontend/           Next.js 16 + React 19 + TypeScript + Tailwind 4, Dockerfile
│   └── src/            app/ (/, /estadisticas, /scraping, api/[...path], healthz), components/, lib/, proxy.ts
├── scripts/            start_local.sh, load_pdf.sh, scrape_full.sh, scrape_status.sh, restore_dump.sh
├── docs/               registro.md, scraping.md (capturas sólo en local)
├── data/               PDF y CSV (no versionados)
├── docker-compose.yml        stack de producción (Docker Swarm, sólo imágenes GHCR)
├── docker-compose.build.yml  override para compilar y probar en local con docker compose
├── .github/workflows/        compila y publica las imágenes arm64/amd64 en GHCR
└── .env.example
```

## Puesta en marcha local (sin Docker)

Requisitos: PostgreSQL 15+ (con `pg_trgm` y `unaccent`), Rust estable, Node 20+, Python 3.11+.

```bash
cp .env.example .env                      # ajuste DATABASE_URL (y PGBIN si hace falta)
createdb estudiantes
./database/migrate.sh                     # crea esquema, funciones, triggers, vistas

# Python (scraper + PDF)
cd scraper && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && cd ..
./scripts/load_pdf.sh <URL-del-PDF>       # descarga, parsea y carga la lista PDF + inicializa la cola

# API Rust
cd backend && cargo build --release && ./target/release/estudiantes-api   # http://localhost:8080

# Frontend
cd frontend && cp .env.example .env.local && npm install && npm run dev  # http://localhost:3000

# Recolección web completa (en segundo plano, reanudable)
nohup ./scripts/scrape_full.sh > logs/scrape_full.out 2>&1 &
./scripts/scrape_status.sh
```
Tras un reinicio de la máquina basta con `./scripts/start_local.sh` (idempotente) y relanzar
`scrape_full.sh`.

## Despliegue en el VPS (Docker Swarm + Traefik)

### 1. Imágenes (GitHub Actions → GHCR)
Cada push a `main` ejecuta `.github/workflows/docker-images.yml`, que compila de forma nativa
(`ubuntu-24.04-arm` y `ubuntu-24.04`) y publica imágenes multi-arquitectura:

* `ghcr.io/mercer3014/estudiantes-api`
* `ghcr.io/mercer3014/estudiantes-frontend`
* `ghcr.io/mercer3014/estudiantes-scraper` (también la usa `estudiantes-migrate`)

con las etiquetas `latest` y `sha-<commit corto>` (p. ej. `sha-1a2b3c4`). El stack usa siempre
la etiqueta fija `IMAGE_TAG=sha-…`.

**Importante:** los paquetes de GHCR nacen **privados**. Después de la primera ejecución, en
GitHub → perfil → *Packages* → cada `estudiantes-*` → *Package settings* → *Change visibility* →
**Public** (GitHub no permite hacerlo desde el workflow con `GITHUB_TOKEN`). Si prefiere dejarlos
privados, haga en el VPS `docker login ghcr.io` con un token `read:packages` y despliegue con
`--with-registry-auth`.

La imagen del frontend **no incrusta secretos**: `API_KEY`, `BASIC_AUTH_*` y `API_INTERNAL_URL`
se leen en tiempo de ejecución. Sólo `NEXT_PUBLIC_APP_NAME` (texto público) se fija al compilar,
desde la variable de repositorio `APP_NAME` (Settings → Secrets and variables → Actions →
Variables; por defecto "Estudiantes").

### 2. Variables
Copie `.env.example` a `.env` en el VPS (no se versiona) y complete:

| Variable | Uso |
|---|---|
| `IMAGE_TAG` | Etiqueta de las imágenes a desplegar (`sha-<commit corto>`) |
| `POSTGRES_DB`, `POSTGRES_USER` | Base y usuario (por defecto `estudiantes`) |
| `POSTGRES_PASSWORD` | Clave de PostgreSQL; genérela en el VPS: `openssl rand -hex 24` |
| `TRAEFIK_BASIC_AUTH_USERS` | Usuarios htpasswd del middleware basicauth de Traefik (ver abajo) |
| `API_KEY` | Clave compartida frontend ↔ API (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | Orígenes permitidos por la API (por defecto el dominio público) |
| `DB_MAX_CONNECTIONS`, `MIN_MIGRACIONES`, `RUST_LOG` | Ajustes de la API |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD_SHA256` | Basic auth propia del frontend, **opcional**; déjelas vacías para no pedir doble login |
| `SCRAPER_*` | Ritmo del scraper; `SCRAPER_INICIAR_VACIA=1` para empezar sin dump |

**Basic auth de Traefik.** Genere el usuario con bcrypt:
```bash
htpasswd -nbB alex 'una-clave-larga'          # o: docker run --rm httpd:2.4-alpine htpasswd -nbB alex '…'
```
El resultado lleva `$`. En `.env` escríbalo entre **comillas simples**
(`TRAEFIK_BASIC_AUTH_USERS='alex:$2y$05$…'`) o expórtelo en el shell; el valor se interpola al
desplegar y nunca se guarda en el repositorio. Sólo si lo pusiera literalmente dentro del YAML
habría que duplicar cada `$` (`$$`).

### 3. Desplegar
```bash
git clone https://github.com/mercer3014/SISTEMA-DE-INFORMACION-DE-ESTUDIANTES.git estudiantes
cd estudiantes && cp .env.example .env && nano .env
set -a; . ./.env; set +a
docker stack deploy -c docker-compose.yml --with-registry-auth estudiantes
docker stack services estudiantes
```
* `estudiantes-db`: PostgreSQL 17, volumen `estudiantes-pgdata`, sin puertos publicados.
* `estudiantes-migrate`: one-shot (`restart_policy: none`), aplica `database/migrations` (idempotente).
* `estudiantes-api` y `estudiantes-scraper`: esperan con back-off a la BD y a las migraciones
  (Swarm ignora `depends_on`).
* `estudiantes-frontend`: Traefik lo publica en `https://estudiantes.nickzar.online`
  (redirección HTTP→HTTPS, certificado `letsencrypt`, basic auth, puerto 3000).
* Límites: db 1 GiB/1 CPU · api 256 MiB/0.5 · frontend 512 MiB/0.5 · scraper 512 MiB/0.5 ·
  migrate 256 MiB. Logs `json-file` 10 MB × 3.

Actualizar: cambie `IMAGE_TAG` y vuelva a ejecutar `docker stack deploy …`.

### 4. Restaurar los datos (dump de PostgreSQL)
En la máquina de origen (PostgreSQL 17):
```bash
pg_dump -Fc --no-owner --no-privileges --exclude-extension=amcheck \
  -d "postgres://USUARIO:CLAVE@localhost:5432/BASE" -f estudiantes.dump
```
En el VPS, con el stack ya desplegado (la BD vacía y migrada; el scraper espera a los datos):
```bash
scripts/restore_dump.sh estudiantes.dump            # stack "estudiantes" por defecto
```
El script escala `estudiantes-api` y `estudiantes-scraper` a 0, copia el dump al contenedor de
`estudiantes-db` y ejecuta allí (pg_restore 17 de la imagen `postgres:17`):
```bash
pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists --exit-on-error /tmp/restore.dump
```
luego libera los registros `en_proceso`, refresca estadísticas, hace `ANALYZE` y vuelve a escalar
a 1. Como el dump trae `public.schema_migrations`, las migraciones quedan como aplicadas y el
scraper reanuda la cola restaurada. Los objetos quedan a nombre del usuario del stack.

### 5. Operación
```bash
docker service logs -f estudiantes_estudiantes-scraper     # progreso de la recolección
docker service logs -f estudiantes_estudiantes-api
docker service ps estudiantes_estudiantes-migrate          # debe quedar "Complete"
docker exec -it $(docker ps -q -f label=com.docker.swarm.service.name=estudiantes_estudiantes-db) \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT * FROM padron.v_scrape_progreso"'
```
El scraper sale con código 0 cuando la cola está completa y no se relanza; ante un fallo o un
reinicio del nodo se reanuda solo.

### Frontend en Vercel (alternativa)
Root Directory `frontend`, variables `API_INTERNAL_URL` (URL de la API accesible desde Vercel),
`API_KEY` y, si se quiere, `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD_SHA256`.

## API REST (interna)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado y nº de estudiantes |
| GET | `/api/estudiantes` | Búsqueda paginada. Parámetros: `q` (nombre en cualquier orden, sin tildes, tolerante a errores; prefijo de registro; CI), `facultad_id`, `carrera_id`, `sede_id`, `gestion`, `sexo` (M/F), `fuente` (`web`, `solo_web`, `solo_pdf`), `activo`, `sort` (`relevancia`, `nombre`, `registro`, `gestion`, `carrera`, `facultad`, `ci`), `order` (`asc`/`desc`), `page`, `page_size` (≤200) |
| GET | `/api/estudiantes/{registro}` | Ficha completa + filas de la lista PDF + nº de consultas web |
| GET | `/api/catalogos/facultades` · `/carreras?facultad_id=` · `/sedes` · `/gestiones` | Catálogos con conteos |
| GET | `/api/stats` | Resumen y conteos por facultad, carrera, gestión y sede (filtrable por `gestion`, `facultad_id`, `carrera_id`, `sede_id`, `sexo`, `activo`) |
| GET | `/api/scraping/progreso` | Estado de la cola, bloques, velocidad y corridas |

Si `API_KEY` está definida, todas las rutas (salvo `/api/health`) exigen el header `x-api-key`.

## Documentación adicional
* [docs/registro.md](docs/registro.md) – estructura del número de registro y dígito verificador.
* [docs/scraping.md](docs/scraping.md) – fuente web, algoritmo de recolección completa, cortesía.
* [database/README.md](database/README.md) – esquema, funciones, triggers y vistas.

## Privacidad
La base contiene **datos personales** (CI, fecha de nacimiento, teléfonos, direcciones). Úsela sólo
para el fin autorizado, mantenga el sitio detrás de autenticación, no exponga la API ni la BD y no
comparta exportaciones ni dumps.
