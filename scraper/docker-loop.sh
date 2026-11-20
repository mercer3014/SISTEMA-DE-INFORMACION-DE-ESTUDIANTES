#!/usr/bin/env bash
# Recolección completa reanudable dentro de Docker (equivalente a scripts/scrape_full.sh).
#  * Libera los registros que quedaron 'en_proceso' (contenedor anterior cortado).
#  * Corre el spider en modo cola; si termina y aún queda trabajo, vuelve a lanzarlo.
#  * Sale con código 0 SÓLO cuando la cola está completa (restart on-failure no la relanza);
#    ante una señal sale con 143 para que Swarm la reanude tras un reinicio del nodo.
#  * Si la BD está vacía (recién creada, antes de restaurar el dump) espera en vez de
#    empezar de cero, salvo SCRAPER_INICIAR_VACIA=1.
# Logs a stdout: docker service logs -f estudiantes_estudiantes-scraper
set -uo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL}"
PAUSA="${SCRAPER_PAUSA_REINTENTO:-60}"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*"; }
q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAqc "$1"; }

CHILD=""
trap 'log "señal recibida, deteniendo"; [ -n "$CHILD" ] && kill -TERM "$CHILD" 2>/dev/null; wait "$CHILD" 2>/dev/null; exit 143' TERM INT

# Espera a que la BD responda y tenga el esquema.
pausa=2
until q "SELECT 1" >/dev/null 2>&1; do
  log "esperando a PostgreSQL… reintento en ${pausa}s"; sleep "$pausa"; pausa=$(( pausa < 30 ? pausa * 2 : 60 ))
done
# Migraciones que deben estar aplicadas: las que trae la imagen (o MIN_MIGRACIONES).
if [ -d /database/migrations ]; then
  MIN="$(find /database/migrations -maxdepth 1 -name '*.sql' | wc -l)"
else
  MIN="${MIN_MIGRACIONES:-9}"
fi
pausa=5
until [ "$(q "SELECT to_regclass('public.schema_migrations') IS NOT NULL AND to_regclass('padron.scrape_objetivo') IS NOT NULL AND (SELECT count(*) FROM public.schema_migrations) >= $MIN" 2>/dev/null)" = "t" ]; do
  log "esperando migraciones (mínimo $MIN)… reintento en ${pausa}s"; sleep "$pausa"; pausa=$(( pausa < 30 ? pausa * 2 : 60 ))
done
if [ "${SCRAPER_INICIAR_VACIA:-0}" != "1" ]; then
  while [ "$(q "SELECT (SELECT count(*) FROM padron.scrape_objetivo) + (SELECT count(*) FROM padron.estudiante)")" = "0" ]; do
    log "BD vacía: esperando la restauración del dump (o defina SCRAPER_INICIAR_VACIA=1)"; sleep 60
  done
fi

while true; do
  q "SELECT padron.fn_liberar_en_proceso(0)" >/dev/null || { log "no se pudo liberar en_proceso"; exit 1; }
  log "iniciando corrida"
  scrapy crawl registro_web &
  CHILD=$!; wait "$CHILD"; rc=$?; CHILD=""
  log "corrida terminó rc=$rc"
  quedan=$(q "SELECT count(*) FROM padron.scrape_objetivo WHERE estado IN ('pendiente','en_proceso') OR (estado='error' AND intentos < 5)") || quedan="?"
  abiertos=$(q "SELECT count(*) FROM padron.scrape_bloque WHERE estado IN ('pendiente','muestreado')") || abiertos="?"
  if [ "$rc" = "0" ] && [ "$quedan" = "0" ] && [ "$abiertos" = "0" ]; then
    log "Recolección COMPLETA."; exit 0
  fi
  log "quedan=$quedan bloques_abiertos=$abiertos; reintentando en ${PAUSA}s"; sleep "$PAUSA"
done
