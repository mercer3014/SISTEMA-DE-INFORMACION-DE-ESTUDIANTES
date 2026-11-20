-- =====================================================================
-- 0005 · Auditoría de cambios en estudiante
-- =====================================================================
CREATE TABLE IF NOT EXISTS padron.auditoria (
    id          bigserial PRIMARY KEY,
    tabla       text NOT NULL,
    operacion   text NOT NULL,
    clave       text,
    cambios     jsonb,          -- sólo columnas que cambiaron: {col: [antes, despues]}
    usuario     text NOT NULL DEFAULT current_user,
    ocurrido_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_aud_clave ON padron.auditoria (tabla, clave, ocurrido_en DESC);

CREATE OR REPLACE FUNCTION padron.tg_auditar_estudiante()
RETURNS trigger LANGUAGE plpgsql AS
$$
DECLARE
    v_old jsonb; v_new jsonb; v_diff jsonb := '{}'::jsonb; k text;
    ignorar text[] := ARRAY['updated_at', 'busqueda', 'nombre_norm', 'web_actualizado_at', 'padron_actualizado_at'];
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO padron.auditoria (tabla, operacion, clave, cambios)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.registro, to_jsonb(OLD) - ignorar);
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD) - ignorar; v_new := to_jsonb(NEW) - ignorar;
        FOR k IN SELECT jsonb_object_keys(v_new) LOOP
            IF v_old->k IS DISTINCT FROM v_new->k THEN
                v_diff := v_diff || jsonb_build_object(k, jsonb_build_array(v_old->k, v_new->k));
            END IF;
        END LOOP;
        IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
        INSERT INTO padron.auditoria (tabla, operacion, clave, cambios)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.registro, v_diff);
    END IF;
    RETURN NEW;
END;
$$;

-- Sólo UPDATE/DELETE: los INSERT masivos de la lista PDF no inflan la auditoría.
DROP TRIGGER IF EXISTS trg_est_auditoria ON padron.estudiante;
CREATE TRIGGER trg_est_auditoria AFTER UPDATE OR DELETE ON padron.estudiante
    FOR EACH ROW EXECUTE FUNCTION padron.tg_auditar_estudiante();
