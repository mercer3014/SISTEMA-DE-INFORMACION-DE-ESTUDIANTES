#!/usr/bin/env bash
# Muestra el progreso de la recolección web.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
PGBIN="${PGBIN:-$HOME/.local/pg17/usr/lib/postgresql/17/bin}"
export PATH="$PGBIN:$PATH"
cd "$ROOT/scraper" && . .venv/bin/activate && python -m uagrm_scraper.planner status
if [ -f "$ROOT/logs/scrape_full.pid" ] && kill -0 "$(cat "$ROOT/logs/scrape_full.pid")" 2>/dev/null; then
  echo "Proceso: CORRIENDO (pid $(cat "$ROOT/logs/scrape_full.pid"))"
else
  echo "Proceso: detenido"
fi
