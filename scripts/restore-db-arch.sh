#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Uso: $0 ARCHIVO.dump [NOMBRE_BD] [ROL_APP]" >&2
  echo "Ejemplo: $0 ~/Futlink-20261121.dump Futlink futlink_app" >&2
}

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage
  exit 2
fi

DUMP_FILE=$(realpath -- "$1")
DB_NAME=${2:-Futlink}
APP_ROLE=${3:-futlink_app}

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "No existe el respaldo: $DUMP_FILE" >&2
  exit 1
fi
if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ || ! "$APP_ROLE" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo 'Usa solo letras, números y guion bajo en la base; el rol debe comenzar con letra minúscula o guion bajo.' >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null || ! command -v psql >/dev/null; then
  echo 'Faltan pg_restore/psql. Instala PostgreSQL y PostGIS primero.' >&2
  exit 1
fi
if ! systemctl is-active --quiet postgresql; then
  echo 'PostgreSQL no está activo. Inicializa el clúster si hace falta y ejecuta: sudo systemctl start postgresql' >&2
  exit 1
fi

if pg_restore --list "$DUMP_FILE" >/dev/null; then
  echo "Archivo de respaldo válido: $DUMP_FILE"
else
  echo 'El archivo no parece un respaldo válido de pg_dump.' >&2
  exit 1
fi

role_exists=$(sudo -u postgres psql -XAt -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT 1 FROM pg_roles WHERE rolname = '$APP_ROLE'")
db_exists=$(sudo -u postgres psql -XAt -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")
if [[ "$role_exists" == '1' ]]; then
  echo "El rol $APP_ROLE ya existe; no lo modificaré. Elige otro rol o revisa el destino." >&2
  exit 1
fi
if [[ "$db_exists" == '1' ]]; then
  echo "La base $DB_NAME ya existe; no la sobrescribiré. Elige otro nombre o migra sobre una base vacía tras respaldarla." >&2
  exit 1
fi

STAGED_DUMP="/var/lib/postgres/futlink-restore-${BASHPID}.dump"
ROLE_CREATED=0
DB_CREATED=0
RESTORE_SUCCEEDED=0

cleanup() {
  status=$?
  if [[ "$ROLE_CREATED" == '1' ]]; then
    sudo -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"$APP_ROLE\" NOSUPERUSER" >/dev/null || true
  fi
  if [[ "$DB_CREATED" == '1' && "$RESTORE_SUCCEEDED" != '1' ]]; then
    sudo -u postgres dropdb --if-exists -- "$DB_NAME" || true
  fi
  if [[ "$ROLE_CREATED" == '1' && "$RESTORE_SUCCEEDED" != '1' ]]; then
    sudo -u postgres dropuser --if-exists -- "$APP_ROLE" || true
  fi
  sudo rm -f -- "$STAGED_DUMP" || true
  exit "$status"
}
trap cleanup EXIT

sudo install -o postgres -g postgres -m 600 -- "$DUMP_FILE" "$STAGED_DUMP"

echo "Creando el rol temporalmente privilegiado $APP_ROLE. Define una contraseña nueva cuando se solicite; la necesitarás para backend/.env."
sudo -u postgres createuser --login --superuser --pwprompt -- "$APP_ROLE"
ROLE_CREATED=1

sudo -u postgres createdb --owner="$APP_ROLE" -- "$DB_NAME"
DB_CREATED=1

echo 'Restaurando esquema, extensiones y todos los datos...'
sudo -u postgres pg_restore \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  --role="$APP_ROLE" \
  --dbname="$DB_NAME" \
  "$STAGED_DUMP"

sudo -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE \"$APP_ROLE\" NOSUPERUSER"

echo 'Verificando PostGIS, migraciones y datos principales:'
sudo -u postgres psql -X -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "SET ROLE \"$APP_ROLE\"" \
  -c "SELECT current_database() AS base, postgis_version() AS postgis" \
  -c 'SELECT (SELECT count(*) FROM users) AS usuarios, (SELECT count(*) FROM matchs) AS partidos, (SELECT count(*) FROM schema_migrations) AS migraciones_aplicadas'

RESTORE_SUCCEEDED=1
echo "Restauración completa. Base: $DB_NAME. Rol de aplicación: $APP_ROLE (sin superusuario)."
echo 'Configura backend/.env en Arch Linux con DB_HOST=localhost, DB_PORT=5432, DB_NAME y DB_USER indicados arriba, y la contraseña que acabas de definir.'
