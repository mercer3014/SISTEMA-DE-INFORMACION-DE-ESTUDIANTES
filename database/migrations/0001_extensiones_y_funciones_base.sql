-- =====================================================================
-- 0001 · Extensiones y funciones utilitarias
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda difusa por trigramas
CREATE EXTENSION IF NOT EXISTS unaccent;  -- quitar tildes (Á -> A, Ñ -> N)

CREATE SCHEMA IF NOT EXISTS padron;
COMMENT ON SCHEMA padron IS 'Estudiantes: datos, scraping y auditoría';

-- unaccent() no es IMMUTABLE; este wrapper sí lo es para poder indexarlo.
CREATE OR REPLACE FUNCTION padron.f_unaccent(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, txt) $$;

-- Normaliza texto para búsqueda: sin tildes, minúsculas, espacios colapsados.
CREATE OR REPLACE FUNCTION padron.fn_normalizar(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT nullif(btrim(regexp_replace(lower(padron.f_unaccent(coalesce(txt, ''))), '\s+', ' ', 'g')), '') $$;

-- Arregla secuencias unicode mal escapadas que devuelve la API web
-- (p.ej. "ECONu00d3MICAS" -> "ECONÓMICAS").
CREATE OR REPLACE FUNCTION padron.fn_reparar_unicode(txt text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$$
DECLARE
    m text[];
    out text := txt;
BEGIN
    IF txt IS NULL THEN RETURN NULL; END IF;
    FOR m IN SELECT regexp_matches(txt, '\\?u([0-9a-fA-F]{4})', 'g') LOOP
        out := replace(out, '\u' || m[1], chr(('x' || lpad(m[1], 8, '0'))::bit(32)::int));
        out := replace(out, 'u' || m[1], chr(('x' || lpad(m[1], 8, '0'))::bit(32)::int));
    END LOOP;
    RETURN out;
END;
$$;

-- Decodifica el número de registro.
-- Patrón observado (ver docs/registro.md): 9 dígitos = [2][AA][resto]
--   dígito 1     : siglo (2 = 2000s; 1 = 1900s en registros antiguos)
--   dígitos 2-3  : año de ingreso (gestión) -> 224xxxxxx = 2024
CREATE OR REPLACE FUNCTION padron.fn_gestion_de_registro(reg text)
RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$
    SELECT CASE
        WHEN reg ~ '^[12][0-9]{8}$' THEN
            ((CASE left(reg, 1) WHEN '2' THEN 2000 ELSE 1900 END) + substr(reg, 2, 2)::int)::smallint
        ELSE NULL
    END
$$;

-- Trigger genérico: mantiene updated_at.
CREATE OR REPLACE FUNCTION padron.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
