"""
Planificador del descubrimiento de registros (algoritmo de recolección completa).

Idea: como el registro es  2 YY SSSSS D  con dígito verificador (ver
common/registro.py), por cada gestión sólo existen 100 000 números válidos y se
pueden generar exactamente, sin adivinar. El espacio se divide en **bloques**
de 100 secuencias (6 primeros dígitos, p.ej. 224102 -> 224102000..224102999).

Estado persistente (checkpoint) en PostgreSQL:
  · padron.scrape_bloque   -> estado de cada bloque
  · padron.scrape_objetivo -> cola de registros a consultar y su resultado

Algoritmo (cada paso es idempotente; se puede detener y reanudar):
  1. Semilla: todos los registros del PDF se encolan con prioridad 1.
  2. Para cada gestión 2000..año actual se crean los bloques 0..M+FRONTERA,
     donde M es el bloque más alto con algún registro conocido (PDF o web).
  3. Bloque 'pendiente':
       · con >= UMBRAL_DENSO registros del PDF (gestión >= 2010) -> se EXPANDE (100 candidatos)
       · si no                                  -> se MUESTREA (MUESTRA candidatos)
  4. Bloque 'muestreado' cuya muestra ya fue consultada:
       · si la muestra encontró >= 1 estudiante nuevo -> se EXPANDE
       · si no                                        -> 'descartado' (rango vacío)
  5. Frontera: si aparecen estudiantes en el bloque más alto conocido de una
     gestión, se crean FRONTERA bloques más; así se descubren rangos que el
     PDF no cubre, y se detiene tras FRONTERA bloques vacíos consecutivos.
  6. Cuando no quedan pendientes ni bloques por decidir, la recolección terminó.

Uso CLI:
    python -m uagrm_scraper.planner init     # crea bloques y encola
    python -m uagrm_scraper.planner step     # un paso del algoritmo
    python -m uagrm_scraper.planner status   # progreso
"""
from __future__ import annotations

import datetime as dt
import sys

from common.registro import candidatos_bloque, digito_verificador

UMBRAL_DENSO = 3          # registros del PDF en un bloque para expandirlo directo
MUESTRA = 20              # candidatos consultados para muestrear un bloque
FRONTERA = 3              # bloques extra después del último bloque con datos
GESTION_MIN = 2000
GESTION_DENSA_MIN = 2010  # antes de esto: muestrear antes de expandir
MAX_INTENTOS = 5


def _prioridad(cur, gestion: int, conocidos_pdf: int, bloque: str) -> int:
    """Ver padron.fn_prioridad_bloque (migración 0008): densos y recientes primero."""
    cur.execute("SELECT padron.fn_prioridad_bloque(%s, %s, %s)", (gestion, conocidos_pdf, bloque))
    return cur.fetchone()[0]


def _muestra(bloque: str) -> list[str]:
    paso = 100 // MUESTRA
    out = []
    for i in range(MUESTRA):
        s = i * paso + (i % paso)          # repartido en el bloque
        base = f"{bloque}{s:02d}"
        out.append(base + str(digito_verificador(base)))
    return out


def asegurar_bloques(cur) -> int:
    """Crea (si faltan) los bloques 0..M+FRONTERA de cada gestión."""
    anio = dt.date.today().year
    cur.execute(
        """
        WITH conocidos AS (
            SELECT left(registro, 6) AS bloque, count(*) FILTER (WHERE en_padron) AS pdf
              FROM padron.estudiante
             WHERE registro ~ '^2[0-9]{8}$'
             GROUP BY 1),
        tope AS (
            SELECT g, coalesce(max(substr(c.bloque, 4)::int), -1) AS m
              FROM generate_series(%(gmin)s::int, %(gmax)s::int) g
              LEFT JOIN conocidos c ON c.bloque LIKE '2' || lpad((g %% 100)::text, 2, '0') || '%%'
             GROUP BY g),
        nuevos AS (
            SELECT '2' || lpad((t.g %% 100)::text, 2, '0') || lpad(b::text, 3, '0') AS bloque
              FROM tope t, generate_series(0, LEAST(t.m + %(fr)s::int, 999)) b)
        INSERT INTO padron.scrape_bloque (bloque, conocidos_pdf)
        SELECT n.bloque, coalesce(c.pdf, 0) FROM nuevos n LEFT JOIN conocidos c USING (bloque)
        ON CONFLICT (bloque) DO NOTHING
        """,
        {"gmin": GESTION_MIN, "gmax": anio, "fr": FRONTERA},
    )
    return cur.rowcount


def _encolar(cur, registros: list[str], prioridad: int) -> int:
    cur.execute("SELECT padron.fn_encolar(%s, 'descubrimiento', %s::smallint)", (registros, prioridad))
    return cur.fetchone()[0]


def procesar_pendientes(cur) -> tuple[int, int]:
    cur.execute("SELECT bloque, gestion, conocidos_pdf FROM padron.scrape_bloque WHERE estado = 'pendiente'")
    expandidos = muestreados = 0
    for bloque, gestion, pdf in cur.fetchall():
        prio = _prioridad(cur, gestion, pdf, bloque)
        # en gestiones antiguas (< 2010) y en el prefijo 200 el PDF dice poco de la
        # densidad real: siempre se muestrea primero y sólo se expande si hay hallazgos
        antiguo = gestion < GESTION_DENSA_MIN or bloque.startswith("200")
        if pdf >= UMBRAL_DENSO and not antiguo:
            _encolar(cur, candidatos_bloque(bloque), prio)
            cur.execute("UPDATE padron.scrape_bloque SET estado = 'expandido' WHERE bloque = %s", (bloque,))
            expandidos += 1
        else:
            m = _muestra(bloque)
            _encolar(cur, m, prio)
            cur.execute(
                "UPDATE padron.scrape_bloque SET estado = 'muestreado', muestreados = %s WHERE bloque = %s",
                (len(m), bloque))
            muestreados += 1
    return expandidos, muestreados


def decidir_muestreados(cur) -> tuple[int, int]:
    """Bloques muestreados cuya muestra ya terminó -> expandir o descartar."""
    cur.execute(
        """
        SELECT b.bloque, b.gestion, b.conocidos_pdf,
               count(*) FILTER (WHERE o.estado = 'encontrado' AND o.origen = 'descubrimiento') AS hallados,
               count(*) FILTER (WHERE o.estado IN ('pendiente', 'en_proceso')
                                   OR (o.estado = 'error' AND o.intentos < %s)) AS abiertos
          FROM padron.scrape_bloque b
          JOIN padron.scrape_objetivo o ON o.bloque = b.bloque
         WHERE b.estado = 'muestreado'
         GROUP BY b.bloque, b.gestion, b.conocidos_pdf
        """,
        (MAX_INTENTOS,),
    )
    exp = desc = 0
    for bloque, gestion, pdf, hallados, abiertos in cur.fetchall():
        if abiertos:
            continue
        if hallados > 0:
            _encolar(cur, candidatos_bloque(bloque), _prioridad(cur, gestion, pdf, bloque))
            cur.execute("UPDATE padron.scrape_bloque SET estado = 'expandido', hallados_muestra = %s "
                        "WHERE bloque = %s", (hallados, bloque))
            exp += 1
        else:
            cur.execute("UPDATE padron.scrape_bloque SET estado = 'descartado', hallados_muestra = 0 "
                        "WHERE bloque = %s", (bloque,))
            desc += 1
    return exp, desc


def paso(conn) -> dict:
    """Un paso completo del algoritmo. Devuelve un resumen."""
    with conn.transaction(), conn.cursor() as cur:
        nuevos_bloques = asegurar_bloques(cur)
        e1, m1 = procesar_pendientes(cur)
        e2, d2 = decidir_muestreados(cur)
        # la expansión/descubrimiento pudo mover la frontera: crear y procesar bloques nuevos
        nb2 = asegurar_bloques(cur)
        e3, m3 = procesar_pendientes(cur)
    return {"bloques_nuevos": nuevos_bloques + nb2, "expandidos": e1 + e2 + e3,
            "muestreados": m1 + m3, "descartados": d2}


def estado(conn) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT estado, count(*) FROM padron.scrape_objetivo GROUP BY 1 ORDER BY 1")
        obj = dict(cur.fetchall())
        cur.execute("SELECT estado, count(*) FROM padron.scrape_bloque GROUP BY 1 ORDER BY 1")
        blq = dict(cur.fetchall())
        cur.execute("SELECT count(*) FILTER (WHERE en_web), count(*) FILTER (WHERE en_padron), "
                    "count(*) FILTER (WHERE en_web AND NOT en_padron), count(*) FROM padron.estudiante")
        web, pdf, solo_web, total = cur.fetchone()
        # ritmo sobre el tiempo ACTIVO de las últimas 2000 consultas (ignora pausas de la máquina)
        cur.execute("""SELECT count(*), max(t), extract(epoch FROM sum(dt)) FROM (
                         SELECT consultado_en t,
                                CASE WHEN consultado_en - lag(consultado_en) OVER (ORDER BY id) < interval '2 minutes'
                                     THEN consultado_en - lag(consultado_en) OVER (ORDER BY id) END dt
                           FROM (SELECT id, consultado_en FROM padron.web_consulta ORDER BY id DESC LIMIT 2000) x) y""")
        n_act, ultima, seg_act = cur.fetchone()
        cur.execute("SELECT count(*) FILTER (WHERE resultado = 'error') FROM padron.web_consulta "
                    "WHERE consultado_en > now() - interval '30 minutes'")
        err30 = cur.fetchone()[0]
    pend = obj.get("pendiente", 0) + obj.get("error", 0) + obj.get("en_proceso", 0)
    ritmo = (n_act - 1) / float(seg_act) if seg_act else 0
    eta = f"{pend / ritmo / 3600:.1f} h de trabajo activo" if ritmo else "—"
    return (f"Cola: {obj}\nBloques: {blq}\n"
            f"Estudiantes: total={total} con_datos_web={web} del_pdf={pdf} solo_web(nuevos)={solo_web}\n"
            f"Ritmo (tiempo activo, últimas 2000): {ritmo:.2f} req/s · errores 30 min: {err30} · última consulta: {ultima} · "
            f"pendientes: {pend} · ETA (sin contar descubrimientos futuros): {eta}")


def main(argv: list[str]) -> int:
    from common.db import connect
    cmd = argv[1] if len(argv) > 1 else "status"
    with connect(autocommit=True) as conn:
        if cmd in ("init", "step"):
            print(paso(conn))
        print(estado(conn))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
