-- =====================================================================
-- 0007 · Índices extra para búsqueda por prefijo de CI
-- =====================================================================
CREATE INDEX IF NOT EXISTS ix_est_ci_pat ON padron.estudiante (ci text_pattern_ops);
ANALYZE padron.estudiante;
