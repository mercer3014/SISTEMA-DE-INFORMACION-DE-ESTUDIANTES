-- =====================================================================
-- 0002 · Catálogos: facultades, carreras, sedes
-- =====================================================================
CREATE TABLE IF NOT EXISTS padron.facultad (
    id           serial PRIMARY KEY,
    nombre       text NOT NULL,
    nombre_norm  text GENERATED ALWAYS AS (padron.fn_normalizar(nombre)) STORED,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_facultad_nombre_norm UNIQUE (nombre_norm)
);
COMMENT ON TABLE padron.facultad IS 'Facultades (nombre normalizado único)';

CREATE TABLE IF NOT EXISTS padron.carrera (
    id           serial PRIMARY KEY,
    facultad_id  int NOT NULL REFERENCES padron.facultad(id) ON UPDATE CASCADE,
    nombre       text NOT NULL,
    nombre_norm  text GENERATED ALWAYS AS (padron.fn_normalizar(nombre)) STORED,
    codigo       text,                      -- código interno (campo "carr" de la web)
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_carrera_facultad_nombre UNIQUE (facultad_id, nombre_norm)
);
CREATE INDEX IF NOT EXISTS ix_carrera_codigo ON padron.carrera (codigo);
COMMENT ON TABLE padron.carrera IS 'Carreras por facultad';

CREATE TABLE IF NOT EXISTS padron.sede (
    id           serial PRIMARY KEY,
    nombre       text NOT NULL,
    nombre_norm  text GENERATED ALWAYS AS (padron.fn_normalizar(nombre)) STORED,
    CONSTRAINT uq_sede_nombre_norm UNIQUE (nombre_norm)
);
COMMENT ON TABLE padron.sede IS 'Sede / lugar (SANTA CRUZ, CAMIRI, MONTERO, ...)';

DROP TRIGGER IF EXISTS trg_facultad_updated ON padron.facultad;
CREATE TRIGGER trg_facultad_updated BEFORE UPDATE ON padron.facultad
    FOR EACH ROW EXECUTE FUNCTION padron.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_carrera_updated ON padron.carrera;
CREATE TRIGGER trg_carrera_updated BEFORE UPDATE ON padron.carrera
    FOR EACH ROW EXECUTE FUNCTION padron.tg_set_updated_at();

-- Upserts idempotentes de catálogo: devuelven el id.
CREATE OR REPLACE FUNCTION padron.fn_upsert_facultad(p_nombre text)
RETURNS int LANGUAGE plpgsql AS
$$
DECLARE v_id int;
BEGIN
    IF padron.fn_normalizar(p_nombre) IS NULL THEN RETURN NULL; END IF;
    SELECT id INTO v_id FROM padron.facultad WHERE nombre_norm = padron.fn_normalizar(p_nombre);
    IF v_id IS NULL THEN
        INSERT INTO padron.facultad (nombre) VALUES (btrim(p_nombre))
        ON CONFLICT (nombre_norm) DO UPDATE SET nombre = padron.facultad.nombre
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION padron.fn_upsert_carrera(p_facultad_id int, p_nombre text, p_codigo text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql AS
$$
DECLARE v_id int;
BEGIN
    IF p_facultad_id IS NULL OR padron.fn_normalizar(p_nombre) IS NULL THEN RETURN NULL; END IF;
    SELECT id INTO v_id FROM padron.carrera
     WHERE facultad_id = p_facultad_id AND nombre_norm = padron.fn_normalizar(p_nombre);
    IF v_id IS NULL THEN
        INSERT INTO padron.carrera (facultad_id, nombre, codigo) VALUES (p_facultad_id, btrim(p_nombre), p_codigo)
        ON CONFLICT (facultad_id, nombre_norm) DO UPDATE SET codigo = coalesce(EXCLUDED.codigo, padron.carrera.codigo)
        RETURNING id INTO v_id;
    ELSIF p_codigo IS NOT NULL THEN
        UPDATE padron.carrera SET codigo = p_codigo WHERE id = v_id AND codigo IS DISTINCT FROM p_codigo;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION padron.fn_upsert_sede(p_nombre text)
RETURNS int LANGUAGE plpgsql AS
$$
DECLARE v_id int;
BEGIN
    IF padron.fn_normalizar(p_nombre) IS NULL THEN RETURN NULL; END IF;
    INSERT INTO padron.sede (nombre) VALUES (btrim(p_nombre))
    ON CONFLICT (nombre_norm) DO UPDATE SET nombre = padron.sede.nombre
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
