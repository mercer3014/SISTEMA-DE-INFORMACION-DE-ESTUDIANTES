#!/usr/bin/env bash
# Aplica las migraciones en orden y registra cuáles ya se aplicaron.
# Uso: DATABASE_URL=postgres://user:pass@host:5432/db ./database/migrate.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?Defina DATABASE_URL}"
# MIGRATE_ESPERAR=segundos: espera a que PostgreSQL acepte conexiones (Docker Swarm no
# tiene depends_on). Por defecto 0 = no esperar.
ESPERAR="${MIGRATE_ESPERAR:-0}"
if [ "$ESPERAR" -gt 0 ]; then
  fin=$(( $(date +%s) + ESPERAR )); pausa=1
  until psql "$DATABASE_URL" -qtAc "SELECT 1" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$fin" ] && { echo "PostgreSQL no respondió en ${ESPERAR}s"; exit 1; }
    echo "esperando a PostgreSQL… (${pausa}s)"; sleep "$pausa"; pausa=$(( pausa < 16 ? pausa * 2 : 30 ))
  done
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS public.schema_migrations (version text PRIMARY KEY, aplicado_en timestamptz NOT NULL DEFAULT now())"
for f in "$DIR"/migrations/*.sql; do
  v="$(basename "$f")"
  if [ "$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM public.schema_migrations WHERE version='$v'")" = "1" ]; then
    echo "· $v (ya aplicada)"; continue
  fi
  echo "→ aplicando $v"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -1 -f "$f"
  psql "$DATABASE_URL" -q -c "INSERT INTO public.schema_migrations(version) VALUES ('$v')"
done
echo "Migraciones OK"
