#!/usr/bin/env bash
# Restaura un `pg_dump -Fc` en la BD del stack Swarm (servicio estudiantes-db) del VPS.
#
#   scripts/restore_dump.sh estudiantes.dump [nombre-del-stack]     # stack por defecto: estudiantes
#
# Pasos: escala api y scraper a 0 → copia el dump al contenedor de la BD → pg_restore 17
# (--no-owner --no-privileges --clean --if-exists --exit-on-error, como el usuario de la BD
# del stack) → libera 'en_proceso', refresca estadísticas, ANALYZE → vuelve a escalar a 1.
# Después las migraciones ya figuran como aplicadas (public.schema_migrations viene en el
# dump) y el scraper reanuda la cola restaurada. Se ejecuta en el nodo donde corre la BD.
set -euo pipefail
DUMP="${1:?Uso: $0 archivo.dump [stack]}"
STACK="${2:-estudiantes}"
[ -f "$DUMP" ] || { echo "No existe $DUMP"; exit 1; }
svc() { echo "${STACK}_estudiantes-$1"; }

DB=$(docker ps -q --filter "label=com.docker.swarm.service.name=$(svc db)" | head -n1)
[ -n "$DB" ] || { echo "No encuentro el contenedor de $(svc db) en este nodo"; exit 1; }
echo "→ BD: contenedor $DB"

echo "→ deteniendo api y scraper"
docker service scale -d "$(svc api)=0" "$(svc scraper)=0" >/dev/null
for i in $(seq 1 60); do
  n=$( { docker ps -q --filter "label=com.docker.swarm.service.name=$(svc api)";
         docker ps -q --filter "label=com.docker.swarm.service.name=$(svc scraper)"; } | wc -l)
  [ "$n" = "0" ] && break; sleep 2
done

echo "→ copiando el dump"
docker cp "$DUMP" "$DB:/tmp/restore.dump"

echo "→ pg_restore (puede tardar unos minutos)"
docker exec "$DB" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists --exit-on-error /tmp/restore.dump'

echo "→ post-restauración"
docker exec "$DB" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qtA \
  -c "SELECT padron.fn_liberar_en_proceso(0)" \
  -c "SELECT padron.fn_refrescar_stats()" \
  -c "ANALYZE" \
  -c "SELECT format(\$\$estudiantes=%s  cola_pendiente=%s  migraciones=%s\$\$,
        (SELECT count(*) FROM padron.estudiante),
        (SELECT count(*) FROM padron.scrape_objetivo WHERE estado IN (\$\$pendiente\$\$,\$\$error\$\$)),
        (SELECT count(*) FROM public.schema_migrations))"'
docker exec "$DB" rm -f /tmp/restore.dump

echo "→ levantando api y scraper"
docker service scale -d "$(svc api)=1" "$(svc scraper)=1" >/dev/null
echo "Listo. Logs del scraper: docker service logs -f $(svc scraper)"
