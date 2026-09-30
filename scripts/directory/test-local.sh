#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIRECTORY_TEST_CLUSTER="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-directory.XXXXXX")"
DIRECTORY_TEST_PORT="${DIRECTORY_TEST_PORT:-55449}"
cleanup(){ if [[ -f "${DIRECTORY_TEST_CLUSTER}/postmaster.pid" ]]; then pg_ctl -D "${DIRECTORY_TEST_CLUSTER}" -m fast stop >/dev/null; fi; rm -rf "${DIRECTORY_TEST_CLUSTER}"; }
trap cleanup EXIT
initdb -D "${DIRECTORY_TEST_CLUSTER}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${DIRECTORY_TEST_CLUSTER}" -o "-h 127.0.0.1 -p ${DIRECTORY_TEST_PORT} -k ${DIRECTORY_TEST_CLUSTER}" -l "${DIRECTORY_TEST_CLUSTER}/postgres.log" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${DIRECTORY_TEST_CLUSTER}" -p "${DIRECTORY_TEST_PORT}" -d postgres)
"${PSQL[@]}" -f "${ROOT}/scripts/directory/fixtures.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT}/supabase/migrations/20260930072147_public_directory.sql" >/dev/null
pg_dump -h "${DIRECTORY_TEST_CLUSTER}" -p "${DIRECTORY_TEST_PORT}" -d postgres -Fc -f "${DIRECTORY_TEST_CLUSTER}/before-tests.dump"
"${PSQL[@]}" -c 'CREATE DATABASE restore_check' >/dev/null
pg_restore -h "${DIRECTORY_TEST_CLUSTER}" -p "${DIRECTORY_TEST_PORT}" -d restore_check "${DIRECTORY_TEST_CLUSTER}/before-tests.dump"
env NODE_ENV=test DATABASE_URL="postgresql://127.0.0.1:${DIRECTORY_TEST_PORT}/postgres" DATABASE_URL_POOL="postgresql://127.0.0.1:${DIRECTORY_TEST_PORT}/postgres" DATABASE_URL_DIRECT="postgresql://127.0.0.1:${DIRECTORY_TEST_PORT}/postgres" DIRECTORY_COMMUNICATIONS_ENABLED=true DIRECTORY_TOKEN_SECRET=local-test-secret-with-at-least-32-characters node --import tsx "${ROOT}/scripts/directory/integration.ts"
