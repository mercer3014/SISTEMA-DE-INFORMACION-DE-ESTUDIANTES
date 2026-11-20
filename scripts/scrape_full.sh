#!/usr/bin/env bash
# Recolección COMPLETA, reanudable. Ejecuta el spider en modo cola hasta que el
# planificador ya no tenga nada que consultar. Si el proceso se cae, se relanza
# (el checkpoint está en PostgreSQL: padron.scrape_objetivo / scrape_bloque).
#
#   nohup scripts/scrape_full.sh > logs/scrape_full.out 2>&1 &
#   detener:  kill $(cat logs/scrape_full.pid)   (se reanuda al volver a lanzarlo)
#   progreso: scripts/scrape_status.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/scraper"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
PGBIN="${PGBIN:-$HOME/.local/pg17/usr/lib/postgresql/17/bin}"
export PATH="$PGBIN:$HOME/.cargo/bin:$PATH"
. .venv/bin/activate
mkdir -p "$ROOT/logs"
echo $$ > "$ROOT/logs/scrape_full.pid"
trap 'kill ${CHILD:-} 2>/dev/null; wait ${CHILD:-} 2>/dev/null; exit 0' TERM INT

export SCRAPER_CONCURRENCY="${SCRAPER_CONCURRENCY:-6}"
export SCRAPER_TARGET_CONCURRENCY="${SCRAPER_TARGET_CONCURRENCY:-3}"
export SCRAPER_DELAY="${SCRAPER_DELAY:-0.2}"

while true; do
  psql "$DATABASE_URL" -qtAc "SELECT padron.fn_liberar_en_proceso(0)" >/dev/null
  ts=$(date +%Y%m%d-%H%M%S)
  echo "[$(date)] iniciando corrida ($ts)"
  scrapy crawl registro_web -s LOG_FILE="$ROOT/logs/scrapy-$ts.log" &
  CHILD=$!; wait $CHILD; rc=$?
  echo "[$(date)] corrida terminó rc=$rc"
  quedan=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM padron.scrape_objetivo WHERE estado IN ('pendiente','en_proceso') OR (estado='error' AND intentos < 5)")
  abiertos=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM padron.scrape_bloque WHERE estado IN ('pendiente','muestreado')")
  if [ "$rc" = "0" ] && [ "$quedan" = "0" ] && [ "$abiertos" = "0" ]; then
    echo "[$(date)] Recolección COMPLETA."; break
  fi
  echo "[$(date)] quedan=$quedan bloques_abiertos=$abiertos; reintentando en 60s"; sleep 60
done
rm -f "$ROOT/logs/scrape_full.pid"
