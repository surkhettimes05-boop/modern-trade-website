#!/bin/sh
set -eu

: "${STORESYNC_APP_PASSWORD:?STORESYNC_APP_PASSWORD is required}"

psql \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$STORESYNC_APP_PASSWORD" \
  --file=/docker-entrypoint-security/create-qa-role.sql
