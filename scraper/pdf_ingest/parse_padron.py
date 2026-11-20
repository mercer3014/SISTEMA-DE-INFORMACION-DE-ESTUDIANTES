"""
Parser de la lista PDF de estudiantes con mesas.

Extrae la tabla de cada página con pdfplumber y genera un CSV normalizado.
Usa varios procesos en paralelo (una porción de páginas por proceso).

Uso:
    python -m pdf_ingest.parse_padron data/padron.pdf data/padron.csv --workers 4
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pdfplumber

COLUMNS = [
    "nro", "facultad", "carrera", "detalle_carrera", "sede", "registro",
    "nombre", "hab_ci", "hab_icu_fac", "hab_ful", "mesa", "recinto",
    "recinto_lugar", "aula", "pagina",
]
HEADER_FIRST = "N°"
REGISTRO_RE = re.compile(r"^\d{6,10}$")


def _clean(v: str | None) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", v.replace("\n", " ")).strip()


def _row_cells_from_runs(page_chars: list[dict], top: float, bottom: float,
                         col_x0: list[float]) -> list[str]:
    """Reconstruye las celdas de una fila a partir de "corridas" de caracteres.

    El PDF dibuja textos largos (p.ej. el nombre de la facultad) por fuera de su
    celda, encima de la columna vecina. Si se recorta por coordenadas, los
    caracteres de ambas columnas se intercalan ("AINCGIÓENN IYE..."). En el
    orden del content stream cada texto es una corrida continua, así que se
    agrupan los caracteres en corridas y cada corrida se asigna a la columna
    donde EMPIEZA. Esto además recupera el nombre completo (no truncado).
    """
    cells: list[list[str]] = [[] for _ in col_x0]
    run: list[dict] = []

    def flush():
        if not run:
            return
        x = run[0]["x0"]
        idx = max(i for i, cx in enumerate(col_x0) if x >= cx - 1.5) if x >= col_x0[0] - 1.5 else 0
        text = "".join(c["text"] for c in run)
        cells[idx].append(text)
        run.clear()

    prev = None
    for c in page_chars:
        mid = (c["top"] + c["bottom"]) / 2
        if not (top <= mid <= bottom):
            continue
        if prev is not None and (
            c["x0"] < prev["x0"] - 0.5                     # salto hacia atrás: nueva línea/objeto
            or c["x0"] - prev["x1"] > 6                     # hueco grande: otra columna
            or abs(c["top"] - prev["top"]) > 2              # otra línea
        ):
            flush()
        run.append(c)
        prev = c
    flush()
    return [_clean(" ".join(parts)) for parts in cells]


def parse_range(pdf_path: str, start: int, end: int) -> tuple[list[list[str]], list[str]]:
    """Procesa las páginas [start, end) (0-indexed). Devuelve (filas, advertencias)."""
    rows: list[list[str]] = []
    warnings: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i in range(start, end):
            page = pdf.pages[i]
            try:
                tables = page.find_tables()
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"pagina {i + 1}: error detectando tabla: {exc}")
                continue
            chars = page.chars  # orden del content stream
            for table in tables:
                col_x0 = None
                for trow in table.rows:
                    if len(trow.cells) == 14 and all(trow.cells):
                        col_x0 = [c[0] for c in trow.cells]
                        break
                data = table.extract()
                for trow, raw in zip(table.rows, data):
                    cells = [_clean(c) for c in raw]
                    if len(cells) != 14 or not cells[0].isdigit():
                        continue
                    if col_x0 is not None:
                        # facultad/carrera: reconstruidas por corridas (ver docstring)
                        _, top, _, bottom = trow.bbox
                        fixed = _row_cells_from_runs(chars, top, bottom, col_x0)
                        if fixed[1]:
                            cells[1] = fixed[1]
                        if fixed[2]:
                            cells[2] = fixed[2]
                    if not REGISTRO_RE.match(cells[5]):
                        # sede larga ("SAN IGNACIO DE VELASCO") desbordada sobre el registro
                        digits = re.sub(r"\D", "", cells[5])
                        letters = re.sub(r"[\d\s]", "", cells[5])
                        if REGISTRO_RE.match(digits) and letters:
                            cells[4] = f"{cells[4]} {letters}".strip()
                            cells[5] = digits
                    if not REGISTRO_RE.match(cells[5]):
                        warnings.append(f"pagina {i + 1}: registro inválido: {cells}")
                        continue
                    rows.append(cells + [str(i + 1)])
            page.flush_cache()
    return rows, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pdf")
    ap.add_argument("csv_out")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--chunk", type=int, default=50, help="páginas por tarea")
    ap.add_argument("--max-pages", type=int, default=0, help="limitar páginas (debug)")
    args = ap.parse_args()

    with pdfplumber.open(args.pdf) as pdf:
        total_pages = len(pdf.pages)
    if args.max_pages:
        total_pages = min(total_pages, args.max_pages)

    t0 = time.time()
    chunks = [(s, min(s + args.chunk, total_pages)) for s in range(0, total_pages, args.chunk)]
    results: dict[int, list[list[str]]] = {}
    all_warnings: list[str] = []
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(parse_range, args.pdf, s, e): s for s, e in chunks}
        done = 0
        for fut in as_completed(futs):
            s = futs[fut]
            rows, warns = fut.result()
            results[s] = rows
            all_warnings.extend(warns)
            done += 1
            print(f"[{done}/{len(chunks)}] páginas desde {s + 1}: {len(rows)} filas "
                  f"({time.time() - t0:.0f}s)", file=sys.stderr, flush=True)

    out = Path(args.csv_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(COLUMNS)
        for s in sorted(results):
            for r in results[s]:
                w.writerow(r)
                n += 1
    warn_path = out.with_suffix(".warnings.txt")
    warn_path.write_text("\n".join(all_warnings), encoding="utf-8")
    print(f"OK: {n} filas de {total_pages} páginas -> {out} "
          f"({len(all_warnings)} advertencias en {warn_path.name}) en {time.time() - t0:.0f}s",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
