#!/usr/bin/env bash
# Descarga (si falta), parsea y carga la lista PDF en PostgreSQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
PGBIN="${PGBIN:-$HOME/.local/pg17/usr/lib/postgresql/17/bin}"
export PATH="$PGBIN:$PATH"
URL="${1:-https://files.uagrm.edu.bo/entidad/215/file/2021/PADRON_ESTUDIANTES_FINAL_03-10-2026_PUBLICAR.pdf}"
PDF="$ROOT/data/$(basename "$URL")"
[ -f "$PDF" ] || curl -L -o "$PDF" "$URL"
cd "$ROOT/scraper" && . .venv/bin/activate
python -m pdf_ingest.parse_padron "$PDF" "$ROOT/data/padron.csv" --workers 3
python -m pdf_ingest.load_padron "$ROOT/data/padron.csv" --pdf "$PDF" --url "$URL"
python -m uagrm_scraper.planner init
