-- =====================================================================
-- 0003 · Estudiantes (entidad central) y padrones PDF
-- =====================================================================
CREATE TABLE IF NOT EXISTS padron.estudiante (
    registro          text PRIMARY KEY CHECK (registro ~ '^[0-9]{6,10}$'),
    nombre_completo   text NOT NULL,             -- "APELLIDO1 APELLIDO2 NOMBRES" (formato padrón)
    nombres           text,
    apellido_pri      text,
    apellido_seg      text,
    ci                text,                      -- carnet de identidad
    lugar_ci          text,                      -- expedido en (SCZ, LPZ, ...)
    sexo              char(1) CHECK (sexo IN ('M', 'F')),
    fecha_nac         date,
    direccion         text,
    telefono          text,
    celular           text,
    activo            boolean,
    plan              text,
    facultad_id       int REFERENCES padron.facultad(id),
    carrera_id        int REFERENCES padron.carrera(id),
    sede_id           int REFERENCES padron.sede(id),
    gestion_ingreso   smallint GENERATED ALWAYS AS (padron.fn_gestion_de_registro(registro)) STORED,
    en_padron         boolean NOT NULL DEFAULT false,
    en_web            boolean NOT NULL DEFAULT false,
    -- columnas de búsqueda mantenidas por trigger
    nombre_norm       text,
    busqueda          tsvector,
    web_actualizado_at    timestamptz,
    padron_actualizado_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE padron.estudiante IS 'Un registro por estudiante (registro universitario). Fusiona PDF + web.';

CREATE INDEX IF NOT EXISTS ix_est_nombre_trgm  ON padron.estudiante USING gin (nombre_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_est_busqueda     ON padron.estudiante USING gin (busqueda);
CREATE INDEX IF NOT EXISTS ix_est_ci           ON padron.estudiante (ci);
CREATE INDEX IF NOT EXISTS ix_est_registro_pat ON padron.estudiante (registro text_pattern_ops);
CREATE INDEX IF NOT EXISTS ix_est_facultad     ON padron.estudiante (facultad_id);
CREATE INDEX IF NOT EXISTS ix_est_carrera      ON padron.estudiante (carrera_id);
CREATE INDEX IF NOT EXISTS ix_est_sede         ON padron.estudiante (sede_id);
CREATE INDEX IF NOT EXISTS ix_est_gestion      ON padron.estudiante (gestion_ingreso);
CREATE INDEX IF NOT EXISTS ix_est_nombre_sort  ON padron.estudiante (nombre_completo);

-- Trigger: completa nombre_completo y recalcula columnas de búsqueda.
CREATE OR REPLACE FUNCTION padron.tg_estudiante_normalizar()
RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
    IF NEW.apellido_pri IS NOT NULL OR NEW.nombres IS NOT NULL THEN
        IF NEW.nombre_completo IS NULL OR NEW.nombre_completo = '' THEN
            NEW.nombre_completo := btrim(concat_ws(' ', NEW.apellido_pri, NEW.apellido_seg, NEW.nombres));
        END IF;
    END IF;
    NEW.nombre_completo := regexp_replace(btrim(upper(NEW.nombre_completo)), '\s+', ' ', 'g');
    NEW.ci := nullif(btrim(NEW.ci), '');
    NEW.nombre_norm := padron.fn_normalizar(NEW.nombre_completo);
    NEW.busqueda :=
        setweight(to_tsvector('simple', coalesce(NEW.nombre_norm, '')), 'A') ||
        setweight(to_tsvector('simple', NEW.registro || ' ' || coalesce(NEW.ci, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(padron.fn_normalizar(NEW.direccion), '')), 'C');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_est_normalizar ON padron.estudiante;
CREATE TRIGGER trg_est_normalizar BEFORE INSERT OR UPDATE ON padron.estudiante
    FOR EACH ROW EXECUTE FUNCTION padron.tg_estudiante_normalizar();
DROP TRIGGER IF EXISTS trg_est_updated ON padron.estudiante;
CREATE TRIGGER trg_est_updated BEFORE UPDATE ON padron.estudiante
    FOR EACH ROW EXECUTE FUNCTION padron.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Padrones PDF (fuente) y sus filas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS padron.padron_fuente (
    id            serial PRIMARY KEY,
    nombre        text NOT NULL,
    url           text,
    archivo       text,
    sha256        text UNIQUE,
    total_filas   int,
    cargado_en    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE padron.padron_fuente IS 'Cada PDF de padrón importado';

-- Staging sin logging para COPY masivo desde el CSV del parser.
CREATE UNLOGGED TABLE IF NOT EXISTS padron.padron_staging (
    nro text, facultad text, carrera text, detalle_carrera text, sede text, registro text,
    nombre text, hab_ci text, hab_icu_fac text, hab_ful text, mesa text, recinto text,
    recinto_lugar text, aula text, pagina text
);

CREATE TABLE IF NOT EXISTS padron.padron_fila (
    id              bigserial PRIMARY KEY,
    fuente_id       int NOT NULL REFERENCES padron.padron_fuente(id) ON DELETE CASCADE,
    registro        text NOT NULL REFERENCES padron.estudiante(registro) ON DELETE CASCADE,
    nro             int,
    facultad_id     int REFERENCES padron.facultad(id),
    carrera_id      int REFERENCES padron.carrera(id),
    detalle_carrera text,
    sede_id         int REFERENCES padron.sede(id),
    nombre          text NOT NULL,
    hab_ci          boolean,    -- columna "CI" de la lista PDF (SI/NO)
    hab_icu_fac     boolean,    -- columna "ICU FAC." (SI/NO)
    hab_ful         boolean,    -- columna "FUL" (SI/NO)
    mesa            int,
    recinto         text,
    recinto_lugar   text,
    aula            text,
    pagina          int,
    CONSTRAINT uq_padron_fila UNIQUE (fuente_id, registro, carrera_id)
);
CREATE INDEX IF NOT EXISTS ix_pf_registro ON padron.padron_fila (registro);
CREATE INDEX IF NOT EXISTS ix_pf_mesa     ON padron.padron_fila (fuente_id, mesa);

-- Procesa padron_staging -> catálogos, estudiante y padron_fila. Idempotente.
CREATE OR REPLACE FUNCTION padron.fn_procesar_padron(p_fuente_id int)
RETURNS TABLE (filas int, estudiantes_nuevos int, estudiantes_actualizados int)
LANGUAGE plpgsql AS
$$
DECLARE
    v_filas int; v_nuevos int; v_total int;
BEGIN
    -- catálogos
    PERFORM padron.fn_upsert_facultad(f) FROM (SELECT DISTINCT facultad f FROM padron.padron_staging) s;
    PERFORM padron.fn_upsert_sede(x) FROM (SELECT DISTINCT sede x FROM padron.padron_staging) s;
    PERFORM padron.fn_upsert_carrera(fa.id, s.carrera)
       FROM (SELECT DISTINCT facultad, carrera FROM padron.padron_staging) s
       JOIN padron.facultad fa ON fa.nombre_norm = padron.fn_normalizar(s.facultad);

    CREATE TEMP TABLE tmp_pad ON COMMIT DROP AS
    SELECT s.*, fa.id AS facultad_id, ca.id AS carrera_id, se.id AS sede_id,
           row_number() OVER (PARTITION BY s.registro ORDER BY s.nro::int DESC) AS rn
      FROM padron.padron_staging s
      JOIN padron.facultad fa ON fa.nombre_norm = padron.fn_normalizar(s.facultad)
      JOIN padron.carrera  ca ON ca.facultad_id = fa.id AND ca.nombre_norm = padron.fn_normalizar(s.carrera)
      LEFT JOIN padron.sede se ON se.nombre_norm = padron.fn_normalizar(s.sede);

    SELECT count(*) INTO v_filas FROM tmp_pad;
    SELECT count(*) INTO v_nuevos FROM tmp_pad t
     WHERE rn = 1 AND NOT EXISTS (SELECT 1 FROM padron.estudiante e WHERE e.registro = t.registro);

    INSERT INTO padron.estudiante AS e (registro, nombre_completo, facultad_id, carrera_id, sede_id,
                                        en_padron, padron_actualizado_at)
    SELECT registro, nombre, facultad_id, carrera_id, sede_id, true, now()
      FROM tmp_pad WHERE rn = 1
    ON CONFLICT (registro) DO UPDATE SET
        -- los datos web (más ricos) tienen prioridad sobre los del PDF
        nombre_completo = CASE WHEN e.en_web THEN e.nombre_completo ELSE EXCLUDED.nombre_completo END,
        facultad_id     = coalesce(e.facultad_id, EXCLUDED.facultad_id),
        carrera_id      = coalesce(e.carrera_id, EXCLUDED.carrera_id),
        sede_id         = EXCLUDED.sede_id,
        en_padron       = true,
        padron_actualizado_at = now();
    GET DIAGNOSTICS v_total = ROW_COUNT;

    INSERT INTO padron.padron_fila (fuente_id, registro, nro, facultad_id, carrera_id, detalle_carrera,
                                    sede_id, nombre, hab_ci, hab_icu_fac, hab_ful, mesa, recinto,
                                    recinto_lugar, aula, pagina)
    SELECT p_fuente_id, registro, nullif(nro, '')::int, facultad_id, carrera_id, nullif(detalle_carrera, ''),
           sede_id, nombre, hab_ci = 'SI', hab_icu_fac = 'SI', hab_ful = 'SI',
           nullif(regexp_replace(mesa, '\D', '', 'g'), '')::int, nullif(recinto, ''),
           nullif(recinto_lugar, ''), nullif(aula, ''), nullif(pagina, '')::int
      FROM tmp_pad
    ON CONFLICT (fuente_id, registro, carrera_id) DO UPDATE SET
        nro = EXCLUDED.nro, hab_ci = EXCLUDED.hab_ci, hab_icu_fac = EXCLUDED.hab_icu_fac,
        hab_ful = EXCLUDED.hab_ful, mesa = EXCLUDED.mesa, recinto = EXCLUDED.recinto,
        recinto_lugar = EXCLUDED.recinto_lugar, aula = EXCLUDED.aula, pagina = EXCLUDED.pagina;

    UPDATE padron.padron_fuente SET total_filas = v_filas WHERE id = p_fuente_id;
    RETURN QUERY SELECT v_filas, v_nuevos, v_total - v_nuevos;
END;
$$;
