-- =====================================================================
-- 0004 · Scraping web: corridas, cola/checkpoint, bloques, log de respuestas
-- =====================================================================
CREATE TABLE IF NOT EXISTS padron.scrape_run (
    id             bigserial PRIMARY KEY,
    spider         text NOT NULL,
    modo           text NOT NULL,                -- seed | descubrimiento | registros | reintentar
    parametros     jsonb NOT NULL DEFAULT '{}'::jsonb,
    estado         text NOT NULL DEFAULT 'corriendo'
                   CHECK (estado IN ('corriendo', 'finalizado', 'interrumpido', 'error')),
    iniciado_en    timestamptz NOT NULL DEFAULT now(),
    finalizado_en  timestamptz,
    stats          jsonb
);

-- Cola persistente = checkpoint. Cada registro candidato tiene un estado;
-- el spider sólo consulta los 'pendiente' / 'error' (con reintentos < max),
-- por lo que se puede detener y reanudar en cualquier momento.
CREATE TABLE IF NOT EXISTS padron.scrape_objetivo (
    registro        text PRIMARY KEY CHECK (registro ~ '^[0-9]{6,10}$'),
    origen          text NOT NULL,               -- padron | descubrimiento | manual
    prioridad       smallint NOT NULL DEFAULT 5, -- menor = antes
    estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_proceso', 'encontrado', 'no_encontrado', 'error')),
    intentos        smallint NOT NULL DEFAULT 0,
    ultimo_error    text,
    ultimo_intento  timestamptz,
    bloque          text GENERATED ALWAYS AS (left(registro, 6)) STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_obj_pendientes ON padron.scrape_objetivo (prioridad, registro)
    WHERE estado IN ('pendiente', 'error');
CREATE INDEX IF NOT EXISTS ix_obj_bloque ON padron.scrape_objetivo (bloque, estado);
DROP TRIGGER IF EXISTS trg_obj_updated ON padron.scrape_objetivo;
CREATE TRIGGER trg_obj_updated BEFORE UPDATE ON padron.scrape_objetivo
    FOR EACH ROW EXECUTE FUNCTION padron.tg_set_updated_at();

-- Bloques de numeración (primeros 6 dígitos = 1000 registros) para el
-- algoritmo de descubrimiento. Se marca 'agotado' cuando ya se exploró
-- y 'descartado' cuando un muestreo no encontró nada.
CREATE TABLE IF NOT EXISTS padron.scrape_bloque (
    bloque          text PRIMARY KEY CHECK (bloque ~ '^[0-9]{6}$'),
    gestion         smallint GENERATED ALWAYS AS (padron.fn_gestion_de_registro(bloque || '000')) STORED,
    conocidos_pdf   int NOT NULL DEFAULT 0,
    estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'muestreado', 'expandido', 'descartado')),
    muestreados     int NOT NULL DEFAULT 0,
    hallados_muestra int NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_bloque_updated ON padron.scrape_bloque;
CREATE TRIGGER trg_bloque_updated BEFORE UPDATE ON padron.scrape_bloque
    FOR EACH ROW EXECUTE FUNCTION padron.tg_set_updated_at();

-- Log crudo de cada respuesta de la API web (trazabilidad / reprocesamiento).
CREATE TABLE IF NOT EXISTS padron.web_consulta (
    id             bigserial PRIMARY KEY,
    run_id         bigint REFERENCES padron.scrape_run(id) ON DELETE SET NULL,
    registro       text NOT NULL,
    http_status    smallint,
    resultado      text NOT NULL CHECK (resultado IN ('encontrado', 'no_encontrado', 'error')),
    payload        jsonb,
    mensaje        text,
    consultado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wc_registro ON padron.web_consulta (registro, consultado_en DESC);
CREATE INDEX IF NOT EXISTS ix_wc_run      ON padron.web_consulta (run_id);

-- Guarda una respuesta de la API y aplica los datos al estudiante.
-- Toda la lógica de negocio del pipeline de Scrapy vive aquí (una sola llamada).
CREATE OR REPLACE FUNCTION padron.fn_registrar_consulta_web(
    p_run_id bigint, p_registro text, p_http_status int, p_resultado text,
    p_payload jsonb, p_mensaje text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS
$$
DECLARE
    d jsonb := p_payload;
    v_fac int; v_car int;
    v_fecha date;
BEGIN
    INSERT INTO padron.web_consulta (run_id, registro, http_status, resultado, payload, mensaje)
    VALUES (p_run_id, p_registro, p_http_status, p_resultado, p_payload, p_mensaje);

    UPDATE padron.scrape_objetivo
       SET estado = p_resultado, intentos = intentos + 1, ultimo_intento = now(),
           ultimo_error = CASE WHEN p_resultado = 'error' THEN p_mensaje END
     WHERE registro = p_registro;

    IF p_resultado <> 'encontrado' OR d IS NULL THEN
        RETURN p_resultado;
    END IF;

    v_fac := padron.fn_upsert_facultad(padron.fn_reparar_unicode(d->>'facultad'));
    v_car := padron.fn_upsert_carrera(v_fac, padron.fn_reparar_unicode(d->>'des_carrera'), d->>'carr');
    BEGIN
        v_fecha := nullif(d->>'fecha_nac', '')::date;
    EXCEPTION WHEN others THEN v_fecha := NULL;
    END;

    INSERT INTO padron.estudiante AS e (
        registro, nombre_completo, nombres, apellido_pri, apellido_seg, ci, lugar_ci, sexo,
        fecha_nac, direccion, telefono, celular, activo, plan, facultad_id, carrera_id,
        en_web, web_actualizado_at)
    VALUES (
        p_registro,
        btrim(concat_ws(' ', nullif(d->>'apellido_pri', ''), nullif(d->>'apellido_seg', ''), nullif(d->>'nombre', ''))),
        nullif(d->>'nombre', ''), nullif(d->>'apellido_pri', ''), nullif(d->>'apellido_seg', ''),
        nullif(d->>'ci', ''), nullif(d->>'lugar_ci', ''),
        CASE WHEN d->>'sexo' IN ('M', 'F') THEN d->>'sexo' END,
        v_fecha, padron.fn_reparar_unicode(nullif(d->>'direccion', '')),
        nullif(d->>'telefono', ''), nullif(d->>'tel_celular', ''),
        CASE d->>'activo' WHEN '1' THEN true WHEN '0' THEN false END,
        nullif(d->>'plan', ''), v_fac, v_car, true, now())
    ON CONFLICT (registro) DO UPDATE SET
        nombre_completo = EXCLUDED.nombre_completo,
        nombres = EXCLUDED.nombres, apellido_pri = EXCLUDED.apellido_pri,
        apellido_seg = EXCLUDED.apellido_seg, ci = EXCLUDED.ci, lugar_ci = EXCLUDED.lugar_ci,
        sexo = EXCLUDED.sexo, fecha_nac = EXCLUDED.fecha_nac, direccion = EXCLUDED.direccion,
        telefono = EXCLUDED.telefono, celular = EXCLUDED.celular, activo = EXCLUDED.activo,
        plan = EXCLUDED.plan, facultad_id = EXCLUDED.facultad_id, carrera_id = EXCLUDED.carrera_id,
        en_web = true, web_actualizado_at = now();
    RETURN p_resultado;
END;
$$;

-- Encola registros (idempotente). Devuelve cuántos se agregaron.
CREATE OR REPLACE FUNCTION padron.fn_encolar(p_registros text[], p_origen text, p_prioridad smallint DEFAULT 5)
RETURNS int LANGUAGE sql AS
$$
    WITH ins AS (
        INSERT INTO padron.scrape_objetivo (registro, origen, prioridad)
        SELECT DISTINCT r, p_origen, p_prioridad FROM unnest(p_registros) r
         WHERE r ~ '^[0-9]{6,10}$'
        ON CONFLICT (registro) DO NOTHING
        RETURNING 1)
    SELECT count(*)::int FROM ins
$$;

-- Toma (y marca 'en_proceso') el siguiente lote de la cola. SKIP LOCKED permite
-- varios workers en paralelo sin duplicar trabajo.
CREATE OR REPLACE FUNCTION padron.fn_tomar_lote(p_limite int, p_max_intentos int DEFAULT 5)
RETURNS SETOF text LANGUAGE sql AS
$$
    UPDATE padron.scrape_objetivo o SET estado = 'en_proceso', ultimo_intento = now()
     WHERE o.registro IN (
        SELECT registro FROM padron.scrape_objetivo
         WHERE estado IN ('pendiente', 'error') AND intentos < p_max_intentos
         ORDER BY prioridad, registro
         LIMIT p_limite
         FOR UPDATE SKIP LOCKED)
    RETURNING o.registro
$$;

-- Si un proceso murió, devuelve a 'pendiente' lo que quedó 'en_proceso'.
CREATE OR REPLACE FUNCTION padron.fn_liberar_en_proceso(p_minutos int DEFAULT 10)
RETURNS int LANGUAGE sql AS
$$
    WITH u AS (
        UPDATE padron.scrape_objetivo SET estado = 'pendiente'
         WHERE estado = 'en_proceso' AND ultimo_intento < now() - make_interval(mins => p_minutos)
        RETURNING 1)
    SELECT count(*)::int FROM u
$$;
