-- =====================================================================
-- 0008 · Errores transitorios de la API y re-priorización de la cola
-- =====================================================================
-- La API a veces responde HTTP 200 con
--   {"type":"error","data":"El sistema no puede procesar la consulta ... [204]"}
-- durante caídas de su backend (observado 02:20-04:01). Eso NO es un "no existe":
-- el registro debe volver a la cola SIN gastar intentos.

DROP FUNCTION IF EXISTS padron.fn_registrar_consulta_web(bigint, text, int, text, jsonb, text);

CREATE OR REPLACE FUNCTION padron.fn_registrar_consulta_web(
    p_run_id bigint, p_registro text, p_http_status int, p_resultado text,
    p_payload jsonb, p_mensaje text DEFAULT NULL, p_transitorio boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS
$$
DECLARE
    d jsonb := p_payload;
    v_fac int; v_car int;
    v_fecha date;
BEGIN
    INSERT INTO padron.web_consulta (run_id, registro, http_status, resultado, payload, mensaje)
    VALUES (p_run_id, p_registro, p_http_status, p_resultado, p_payload, p_mensaje);

    IF p_transitorio THEN
        UPDATE padron.scrape_objetivo
           SET estado = 'pendiente', ultimo_intento = now(), ultimo_error = p_mensaje
         WHERE registro = p_registro;
        RETURN 'transitorio';
    END IF;

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

-- Prioridad según probabilidad/valor (menor = antes):
--   1  registros del PDF (estudiantes vigentes, existen seguro; se completan con CI, etc.)
--   2  bloques densos (>= 10 registros en el PDF) de gestiones >= 2015
--   3  resto de bloques y muestras de gestiones >= 2010
--   4  gestiones 2001-2009
--   5  prefijo 200 (formato antiguo disperso)
CREATE OR REPLACE FUNCTION padron.fn_prioridad_bloque(p_gestion int, p_conocidos_pdf int, p_bloque text)
RETURNS smallint LANGUAGE sql IMMUTABLE AS
$$
    SELECT (CASE
        WHEN p_bloque LIKE '200%'                        THEN 5
        WHEN p_gestion >= 2015 AND p_conocidos_pdf >= 10 THEN 2
        WHEN p_gestion >= 2010                           THEN 3
        ELSE 4 END)::smallint
$$;

CREATE OR REPLACE FUNCTION padron.fn_repriorizar()
RETURNS int LANGUAGE plpgsql AS
$$
DECLARE n int; m int;
BEGIN
    UPDATE padron.scrape_objetivo o
       SET prioridad = CASE WHEN o.origen = 'padron' THEN 1
                            ELSE padron.fn_prioridad_bloque(b.gestion, b.conocidos_pdf, b.bloque) END
      FROM padron.scrape_bloque b
     WHERE b.bloque = o.bloque AND o.estado IN ('pendiente', 'error')
       AND o.prioridad IS DISTINCT FROM CASE WHEN o.origen = 'padron' THEN 1
                            ELSE padron.fn_prioridad_bloque(b.gestion, b.conocidos_pdf, b.bloque) END;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- semillas sin bloque (registros de 7 dígitos / prefijos antiguos)
    UPDATE padron.scrape_objetivo SET prioridad = 1
     WHERE origen = 'padron' AND estado IN ('pendiente', 'error') AND prioridad <> 1;
    GET DIAGNOSTICS m = ROW_COUNT;
    RETURN n + m;
END;
$$;

-- Dentro de cada prioridad: gestiones más recientes primero (registro DESC).
CREATE OR REPLACE FUNCTION padron.fn_tomar_lote(p_limite int, p_max_intentos int DEFAULT 5)
RETURNS SETOF text LANGUAGE sql AS
$$
    UPDATE padron.scrape_objetivo o SET estado = 'en_proceso', ultimo_intento = now()
     WHERE o.registro IN (
        SELECT registro FROM padron.scrape_objetivo
         WHERE estado IN ('pendiente', 'error') AND intentos < p_max_intentos
         ORDER BY prioridad, registro DESC
         LIMIT p_limite
         FOR UPDATE SKIP LOCKED)
    RETURNING o.registro
$$;

DROP INDEX IF EXISTS padron.ix_obj_pendientes;
CREATE INDEX ix_obj_pendientes ON padron.scrape_objetivo (prioridad, registro DESC)
    WHERE estado IN ('pendiente', 'error');

-- Los registros que agotaron intentos por la caída "[204]" vuelven a la cola.
UPDATE padron.scrape_objetivo SET estado = 'pendiente', intentos = 0
 WHERE estado = 'error' AND ultimo_error LIKE '%no puede procesar%';

SELECT padron.fn_repriorizar();
