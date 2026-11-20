# Base de datos (PostgreSQL 15+)

Esquema `padron`. Migraciones versionadas en `migrations/` (se aplican en orden con `migrate.sh`,
que registra las aplicadas en `public.schema_migrations`).

| Migración | Contenido |
|---|---|
| 0001 | Extensiones `pg_trgm`, `unaccent`; funciones `f_unaccent`, `fn_normalizar`, `fn_reparar_unicode`, `fn_gestion_de_registro`; trigger genérico `tg_set_updated_at` |
| 0002 | Catálogos `facultad`, `carrera`, `sede` + upserts `fn_upsert_*` |
| 0003 | Entidad central `estudiante` (registro PK, gestión generada), trigger de normalización/búsqueda (`nombre_norm`, `busqueda` tsvector), `padron_fuente`, `padron_staging`, `padron_fila`, `fn_procesar_padron()` |
| 0004 | Scraping: `scrape_run`, `scrape_objetivo` (cola/checkpoint), `scrape_bloque` (descubrimiento), `web_consulta` (log crudo JSON), `fn_registrar_consulta_web()`, `fn_encolar()`, `fn_tomar_lote()` (SKIP LOCKED), `fn_liberar_en_proceso()` |
| 0005 | `auditoria` + trigger `tg_auditar_estudiante` (guarda sólo columnas cambiadas) |
| 0006 | Vistas `v_estudiante`, `v_stats_facultad`, `v_stats_sede`, `v_scrape_progreso`; vistas materializadas `mv_stats_carrera`, `mv_stats_gestion`; `fn_refrescar_stats()`; `fn_buscar_estudiantes()` |
| 0007 | Índice de prefijo para CI |

## Reglas de fusión PDF + web
* La **web es la fuente principal**: `fn_registrar_consulta_web` sobrescribe nombre, facultad, carrera, CI, etc.
* El PDF sólo completa lo que falta (`coalesce`) y no pisa el nombre si el estudiante ya tiene datos web.
* El detalle de la lista PDF (mesa, recinto, habilitaciones) queda en `padron_fila` como información secundaria.

## Índices de búsqueda
* `gin (nombre_norm gin_trgm_ops)` – coincidencias parciales y tolerancia a errores (`%`, `LIKE '%..%'`).
* `gin (busqueda)` – full-text (`simple`, sin tildes) en nombre + registro + CI.
* `registro text_pattern_ops`, `ci text_pattern_ops` – búsqueda por prefijo.

## Consultas útiles
```sql
SELECT * FROM padron.fn_buscar_estudiantes('maria jose', p_gestion => 2024::smallint);
SELECT * FROM padron.v_estudiante WHERE registro = '224102117';
SELECT * FROM padron.v_scrape_progreso;
SELECT padron.fn_refrescar_stats();
```
