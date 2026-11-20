#!/usr/bin/env bash
# Levanta (o repara) PostgreSQL + API Rust + frontend Next.js en esta máquina (desarrollo local).
# Idempotente: se puede llamar tras cualquier reinicio; no toca los datos.
#
#   scripts/start_local.sh
#   # luego, para reanudar la recolección:
#   nohup scripts/scrape_full.sh >> logs/scrape_full.out 2>&1 &
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
mkdir -p "$ROOT/logs"

# ---- rutas persistentes (bajo /home/box; /opt NO se conserva) --------------
PGBIN="${PGBIN:-$HOME/.local/pg17/usr/lib/postgresql/17/bin}"
PGDATA="${PGDATA:-$HOME/.local/pgdata/17}"
PGRUN="${PGRUN:-$HOME/.local/pgrun}"
PGLOG="${PGLOG:-$HOME/.local/pgdata/pg.log}"
PKG="$HOME/.local/pkgcache/postgresql-17_17.12-1.pgdg13+1_amd64.deb"
PKG_CLIENT="$HOME/.local/pkgcache/postgresql-client-17_17.12-1.pgdg13+1_amd64.deb"
export PATH="$HOME/.cargo/bin:$PGBIN:$PATH"

asegurar_pg_binarios() {
  if [ -x "$PGBIN/postgres" ] && [ -x "$PGBIN/pg_ctl" ] && [ -x "$PGBIN/psql" ]; then
    return 0
  fi
  echo "→ reinstalando binarios de PostgreSQL 17 en $HOME/.local/pg17 (persistentes)"
  mkdir -p "$HOME/.local/pg17" "$HOME/.local/pkgcache"
  if [ ! -f "$PKG" ]; then
    echo "  descargando $PKG"
    curl -sSfo "$PKG" \
      "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/postgresql-17_17.12-1.pgdg13%2B1_amd64.deb"
  fi
  if [ ! -f "$PKG_CLIENT" ]; then
    curl -sSfo "$PKG_CLIENT" \
      "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/postgresql-client-17_17.12-1.pgdg13%2B1_amd64.deb"
  fi
  dpkg -x "$PKG" "$HOME/.local/pg17"
  dpkg -x "$PKG_CLIENT" "$HOME/.local/pg17"
  [ -x "$PGBIN/postgres" ] || { echo "ERROR: no se pudo instalar postgres en $PGBIN"; exit 1; }
  echo "  $($PGBIN/postgres --version)"
}

# Carpetas vacías que Postgres espera y que a veces se pierden al restaurar el
# volumen (el contenido real —base/, global/, pg_wal/, …— sí se conserva).
reparar_pgdata() {
  [ -d "$PGDATA" ] || { echo "ERROR: no existe $PGDATA (no se puede crear un cluster nuevo aquí)"; exit 1; }
  [ -f "$PGDATA/PG_VERSION" ] || { echo "ERROR: $PGDATA no parece un cluster PostgreSQL"; exit 1; }
  chmod 700 "$PGDATA" 2>/dev/null || true
  find "$PGDATA" -type d -exec chmod 700 {} + 2>/dev/null || true
  for d in pg_commit_ts pg_dynshmem pg_logical/mappings pg_logical/snapshots \
           pg_notify pg_replslot pg_serial pg_snapshots pg_stat pg_stat_tmp \
           pg_tblspc pg_twophase pg_wal/archive_status pg_wal/summaries; do
    mkdir -p -m 700 "$PGDATA/$d"
  done
  # pid de un postmaster muerto tras un reinicio
  if [ -f "$PGDATA/postmaster.pid" ] && ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "→ eliminando postmaster.pid huérfano"
    rm -f "$PGDATA/postmaster.pid"
  fi
}

iniciar_postgres() {
  asegurar_pg_binarios
  reparar_pgdata
  mkdir -p "$PGRUN"
  if "$PGBIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
    echo "· PostgreSQL ya está escuchando en :5432"
    return 0
  fi
  echo "→ iniciando PostgreSQL ($($PGBIN/postgres --version | awk '{print $NF}'))"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" -o "-p 5432 -k $PGRUN -c shared_buffers=256MB" -w start
  for i in $(seq 1 30); do
    "$PGBIN/pg_isready" -h localhost -p 5432 -q && break
    sleep 0.5
  done
  "$PGBIN/pg_isready" -h localhost -p 5432 -q || { echo "ERROR: PostgreSQL no arrancó; ver $PGLOG"; exit 1; }
}

iniciar_api() {
  if curl -sf --max-time 2 http://127.0.0.1:8080/api/health >/dev/null; then
    echo "· API ya responde en :8080"
    return 0
  fi
  echo "→ iniciando API Rust (http://localhost:8080)"
  (cd "$ROOT/backend" && [ -x target/release/estudiantes-api ] || cargo build --release)
  # mata restos de un proceso anterior (también el binario con el nombre antiguo)
  pkill -f "$ROOT/backend/target/release/estudiantes-api" 2>/dev/null || true
  pkill -f "$ROOT/backend/target/release/uagrm-padron-api" 2>/dev/null || true
  sleep 0.3
  (cd "$ROOT/backend" && nohup ./target/release/estudiantes-api > "$ROOT/logs/api.log" 2>&1 &)
  for i in $(seq 1 40); do
    curl -sf --max-time 1 http://127.0.0.1:8080/api/health >/dev/null && break
    sleep 0.25
  done
  curl -sf --max-time 2 http://127.0.0.1:8080/api/health >/dev/null \
    || { echo "ERROR: la API no respondió; ver $ROOT/logs/api.log"; exit 1; }
}

iniciar_frontend() {
  if curl -sf --max-time 2 http://127.0.0.1:3000 >/dev/null; then
    echo "· frontend ya responde en :3000"
    return 0
  fi
  echo "→ iniciando frontend Next.js (http://localhost:3000)"
  (cd "$ROOT/frontend" && [ -d .next ] || npm run build)
  pkill -f "next start" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  sleep 0.3
  (cd "$ROOT/frontend" && PORT=3000 nohup npm run start > "$ROOT/logs/frontend.log" 2>&1 &)
  for i in $(seq 1 40); do
    curl -sf --max-time 1 http://127.0.0.1:3000 >/dev/null && break
    sleep 0.25
  done
  curl -sf --max-time 2 http://127.0.0.1:3000 >/dev/null \
    || { echo "ERROR: el frontend no respondió; ver $ROOT/logs/frontend.log"; exit 1; }
}

iniciar_postgres
iniciar_api
iniciar_frontend

# libera registros que el scraper dejó 'en_proceso' al caerse
if [ -n "${DATABASE_URL:-}" ]; then
  psql "$DATABASE_URL" -qtAc "SELECT padron.fn_liberar_en_proceso(0)" >/dev/null 2>&1 || true
fi

echo
echo "Listo."
curl -s http://127.0.0.1:8080/api/health; echo
echo "Scraping:  nohup $ROOT/scripts/scrape_full.sh >> $ROOT/logs/scrape_full.out 2>&1 &"
echo "Progreso:  $ROOT/scripts/scrape_status.sh"
