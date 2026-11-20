"""
Carga el CSV generado por parse_padron.py en PostgreSQL.

1. Registra el PDF en padron.padron_fuente (sha256 -> idempotente).
2. COPY del CSV a padron.padron_staging.
3. padron.fn_procesar_padron(): catálogos, estudiantes y filas de la lista PDF.
4. Encola todos los registros en padron.scrape_objetivo (semilla del scraper web).
5. Refresca las estadísticas.

Uso:
    python -m pdf_ingest.load_padron data/padron.csv --pdf data/padron.pdf --url https://...
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from common.db import connect


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv")
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--url", default=None)
    ap.add_argument("--nombre", default=None)
    args = ap.parse_args()

    pdf = Path(args.pdf)
    digest = sha256(pdf)
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO padron.padron_fuente (nombre, url, archivo, sha256)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (sha256) DO UPDATE SET cargado_en = now()
               RETURNING id""",
            (args.nombre or pdf.stem, args.url, pdf.name, digest),
        )
        fuente_id = cur.fetchone()[0]
        cur.execute("TRUNCATE padron.padron_staging")
        with open(args.csv, "r", encoding="utf-8") as fh, cur.copy(
            "COPY padron.padron_staging FROM STDIN WITH (FORMAT csv, HEADER true)"
        ) as cp:
            while data := fh.read(1 << 16):
                cp.write(data)
        cur.execute("SELECT count(*) FROM padron.padron_staging")
        staged = cur.fetchone()[0]
        cur.execute("SELECT * FROM padron.fn_procesar_padron(%s)", (fuente_id,))
        filas, nuevos, actualizados = cur.fetchone()
        # prioridad por gestión (igual que el planificador): recientes primero
        cur.execute(
            """SELECT coalesce(sum(padron.fn_encolar(regs, 'padron', prio)), 0)
                 FROM (SELECT CASE WHEN g >= 2018 THEN 2 WHEN g >= 2010 THEN 3 ELSE 4 END::smallint AS prio,
                              array_agg(DISTINCT registro) AS regs
                         FROM (SELECT registro, padron.fn_gestion_de_registro(registro) AS g
                                 FROM padron.padron_staging) s
                        GROUP BY 1) t"""
        )
        encolados = cur.fetchone()[0]
        cur.execute("TRUNCATE padron.padron_staging")
        cur.execute("SELECT padron.fn_refrescar_stats()")
    print(f"fuente_id={fuente_id} staging={staged} filas={filas} "
          f"estudiantes_nuevos={nuevos} actualizados={actualizados} encolados_web={encolados}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
