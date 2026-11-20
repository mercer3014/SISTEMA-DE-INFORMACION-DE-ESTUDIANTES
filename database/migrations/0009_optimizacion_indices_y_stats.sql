-- =====================================================================
-- 0009 · Índices de consulta/monitoreo y vistas materializadas de resumen
-- =====================================================================

-- 1. Acelera /api/scraping/progreso (últimos 10 min y última consulta sin escaneo completo)
CREATE INDEX IF NOT EXISTS ix_wc_consultado_en
    ON padron.web_consulta (consultado_en DESC);

-- 2. Acelera filtros de estadísticas y búsqueda por gestión / género / estado
CREATE INDEX IF NOT EXISTS ix_est_gestion_sexo
    ON padron.estudiante (gestion_ingreso, sexo);

CREATE INDEX IF NOT EXISTS ix_est_activo
    ON padron.estudiante (activo)
    WHERE activo IS NOT NULL;

-- 3. Resumen global materializado (1 fila) para /api/stats sin filtro y total rápido
DROP MATERIALIZED VIEW IF EXISTS padron.mv_stats_resumen;
CREATE MATERIALIZED VIEW padron.mv_stats_resumen AS
SELECT 1::int                                                AS id,
       count(*)::bigint                                      AS total,
       count(*) FILTER (WHERE en_web)::bigint                AS en_web,
       count(*) FILTER (WHERE en_padron)::bigint             AS en_padron,
       count(*) FILTER (WHERE en_web AND NOT en_padron)::bigint AS solo_web,
       count(ci)::bigint                                     AS con_ci,
       count(*) FILTER (WHERE sexo = 'M')::bigint            AS hombres,
       count(*) FILTER (WHERE sexo = 'F')::bigint            AS mujeres,
       count(*) FILTER (WHERE activo IS TRUE)::bigint        AS activos,
       count(*) FILTER (WHERE activo IS FALSE)::bigint       AS inactivos
  FROM padron.estudiante;
CREATE UNIQUE INDEX ux_mv_stats_resumen ON padron.mv_stats_resumen (id);

-- 4. Conteo materializado por sede
DROP MATERIALIZED VIEW IF EXISTS padron.mv_stats_sede CASCADE;
CREATE MATERIALIZED VIEW padron.mv_stats_sede AS
SELECT s.id                                                  AS sede_id,
       s.nombre                                              AS sede,
       count(e.registro)::bigint                             AS total,
       count(e.registro) FILTER (WHERE e.en_web)::bigint     AS con_datos_web
  FROM padron.sede s
  LEFT JOIN padron.estudiante e ON e.sede_id = s.id
 GROUP BY s.id, s.nombre;
CREATE UNIQUE INDEX ux_mv_stats_sede ON padron.mv_stats_sede (sede_id);

CREATE OR REPLACE VIEW padron.v_stats_sede AS
SELECT sede_id, sede, total
  FROM padron.mv_stats_sede;

-- 5. Actualiza el refresco periódico para incluir todas las vistas materializadas
CREATE OR REPLACE FUNCTION padron.fn_refrescar_stats()
RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_carrera;
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_gestion;
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_sede;
    REFRESH MATERIALIZED VIEW CONCURRENTLY padron.mv_stats_resumen;
END;
$$;

ANALYZE padron.estudiante;
ANALYZE padron.web_consulta;
