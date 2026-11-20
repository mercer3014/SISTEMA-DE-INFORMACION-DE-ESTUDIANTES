-- =====================================================================
-- 0006 · Vistas, estadísticas y función de búsqueda
-- =====================================================================

-- Vista "plana" del estudiante con catálogos y datos del último padrón.
CREATE OR REPLACE VIEW padron.v_estudiante AS
SELECT e.registro, e.nombre_completo, e.nombres, e.apellido_pri, e.apellido_seg,
       e.ci, e.lugar_ci, e.sexo, e.fecha_nac, e.direccion, e.telefono, e.celular,
       e.activo, e.plan, e.gestion_ingreso,
       e.facultad_id, f.nombre AS facultad,
       e.carrera_id, c.nombre AS carrera, c.codigo AS carrera_codigo,
       e.sede_id, s.nombre AS sede,
       e.en_padron, e.en_web,
       pf.mesa, pf.recinto, pf.recinto_lugar, pf.aula,
       pf.hab_ci, pf.hab_icu_fac, pf.hab_ful,
       e.web_actualizado_at, e.padron_actualizado_at, e.created_at, e.updated_at
  FROM padron.estudiante e
  LEFT JOIN padron.facultad f ON f.id = e.facultad_id
  LEFT JOIN padron.carrera  c ON c.id = e.carrera_id
  LEFT JOIN padron.sede     s ON s.id = e.sede_id
  LEFT JOIN LATERAL (
        SELECT p.* FROM padron.padron_fila p
         WHERE p.registro = e.registro
         ORDER BY p.fuente_id DESC, p.id DESC LIMIT 1) pf ON true;

-- Estadísticas materializadas (rápidas para el dashboard; refrescar tras cargas).
DROP MATERIALIZED VIEW IF EXISTS padron.mv_stats_carrera CASCADE;
CREATE MATERIALIZED VIEW padron.mv_stats_carrera AS
SELECT f.id AS facultad_id, f.nombre AS facultad, c.id AS carrera_id, c.nombre AS carrera,
       count(e.registro)::bigint                           AS total,
       count(e.registro) FILTER (WHERE e.en_web)::bigint   AS con_datos_web,
       count(e.registro) FILTER (WHERE e.sexo = 'M')::bigint AS hombres,
       count(e.registro) FILTER (WHERE e.sexo = 'F')::bigint AS mujeres
  FROM padron.carrera c
  JOIN padron.facultad f ON f.id = c.facultad_id
  LEFT JOIN padron.estudiante e ON e.carrera_id = c.id
 GROUP BY f.id, f.nombre, c.id, c.nombre;
CREATE UNIQUE INDEX ux_mv_stats_carrera ON padron.mv_stats_carrera (carrera_id);

DROP MATERIALIZED VIEW IF EXISTS padron.mv_stats_gestion;
CREATE MATERIALIZED VIEW padron.mv_stats_gestion AS
SELECT gestion_ingreso AS gestion, count(*)::bigint AS total,
       count(*) FILTER (WHERE en_web)::bigint AS con_datos_web
  FROM padron.estudiante
 WHERE gestion_ingreso IS NOT NULL
 GROUP BY gestion_ingreso;
CREATE UNIQUE INDEX ux_mv_stats_gestion ON padron.mv_stats_gestion (gestion);

CREATE OR REPLACE VIEW padron.v_stats_facultad AS
SELECT facultad_id, facultad, sum(total)::bigint AS total,
       sum(con_datos_web)::bigint AS con_datos_web, count(*)::bigint AS carreras
  FROM padron.mv_stats_carrera GROUP BY facultad_id, facultad;

CREATE OR REPLACE VIEW padron.v_stats_sede AS
SELECT s.id AS sede_id, s.nombre AS sede, count(e.registro)::bigint AS total
  FROM padron.sede s LEFT JOIN padron.estudiante e ON e.sede_id = s.id
 GROUP BY s.id, s.nombre;

-- Progreso del scraping (monitoreo).
CREATE OR REPLACE VIEW padron.v_scrape_progreso AS
SELECT origen, estado, count(*)::bigint AS total, max(ultimo_intento) AS ultimo
  FROM padron.scrape_objetivo GROUP BY origen, estado;

CREATE OR REPLACE FUNCTION padron.fn_refrescar_stats()
RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_carrera;
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_gestion;
END;
$$;

-- Búsqueda: texto libre (nombre / registro / CI, con o sin tildes, tolerante
-- a errores con trigramas) + filtros. Devuelve total para paginar.
CREATE OR REPLACE FUNCTION padron.fn_buscar_estudiantes(
    p_q            text     DEFAULT NULL,
    p_facultad_id  int      DEFAULT NULL,
    p_carrera_id   int      DEFAULT NULL,
    p_sede_id      int      DEFAULT NULL,
    p_gestion      smallint DEFAULT NULL,
    p_limite       int      DEFAULT 25,
    p_offset       int      DEFAULT 0)
RETURNS TABLE (registro text, nombre_completo text, ci text, facultad text, carrera text,
               sede text, gestion_ingreso smallint, en_web boolean, rank real, total bigint)
LANGUAGE plpgsql STABLE AS
$$
DECLARE t text := padron.fn_normalizar(p_q);
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT e.registro, e.nombre_completo, e.ci, e.facultad_id, e.carrera_id, e.sede_id,
               e.gestion_ingreso, e.en_web,
               CASE WHEN t IS NULL THEN 0
                    WHEN e.registro = t OR e.ci = t THEN 2
                    ELSE similarity(e.nombre_norm, t) END::real AS rk
          FROM padron.estudiante e
         WHERE (t IS NULL
                OR e.registro LIKE t || '%'
                OR e.ci = t
                OR e.nombre_norm LIKE '%' || t || '%'
                OR e.busqueda @@ plainto_tsquery('simple', t))
           AND (p_facultad_id IS NULL OR e.facultad_id = p_facultad_id)
           AND (p_carrera_id  IS NULL OR e.carrera_id  = p_carrera_id)
           AND (p_sede_id     IS NULL OR e.sede_id     = p_sede_id)
           AND (p_gestion     IS NULL OR e.gestion_ingreso = p_gestion))
    SELECT b.registro, b.nombre_completo, b.ci, f.nombre, c.nombre, s.nombre,
           b.gestion_ingreso, b.en_web, b.rk, count(*) OVER ()
      FROM base b
      LEFT JOIN padron.facultad f ON f.id = b.facultad_id
      LEFT JOIN padron.carrera  c ON c.id = b.carrera_id
      LEFT JOIN padron.sede     s ON s.id = b.sede_id
     ORDER BY b.rk DESC, b.nombre_completo
     LIMIT p_limite OFFSET p_offset;
END;
$$;
