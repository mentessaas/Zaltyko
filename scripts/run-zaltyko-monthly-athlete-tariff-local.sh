#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-monthly-tariff.XXXXXX")"
PG_PORT="${ZALTYKO_MONTHLY_TARIFF_TEST_PG_PORT:-55463}"
PG_LOG="${PG_DIR}/postgres.log"

if ! [[ "${PG_PORT}" =~ ^[0-9]+$ ]] || ((PG_PORT < 1024 || PG_PORT > 65535)); then
  echo "ZALTYKO_MONTHLY_TARIFF_TEST_PG_PORT must be an unused TCP port in 1024..65535" >&2
  exit 1
fi

python3 - "${PG_PORT}" <<'PY'
import socket
import sys

with socket.socket() as probe:
    try:
        probe.bind(("127.0.0.1", int(sys.argv[1])))
    except OSError as error:
        raise SystemExit(f"Test port is not available on loopback: {error}")
PY

cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null
  fi
  rm -rf "${PG_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-h 127.0.0.1 -p ${PG_PORT} -k ${PG_DIR}" -l "${PG_LOG}" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${PG_PORT}" -d postgres)

"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
SQL

for migration in \
  20261006080702_establish_zaltyko_domain_foundation.sql \
  20261013100000_model_sport_profiles_and_complementary_activities.sql \
  20261006085254_add_operational_enrollment_invariants.sql \
  20261006090034_add_trials_waitlists_families.sql \
  20261006093047_add_internal_billing_ledger.sql
do
  "${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/${migration}" >/dev/null
done

"${PSQL[@]}" -f "${ROOT_DIR}/supabase/fixtures/zaltyko_synthetic_academies.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/tests/zaltyko_monthly_athlete_tariff_pre_migration.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql" >/dev/null
"${PSQL[@]}" -Atc "select version()" | sed 's/^/Fresh local database: /'
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/tests/zaltyko_monthly_athlete_tariff_schema.sql"

echo "Fresh PostgreSQL monthly athlete tariff schema/RLS checks: PASS"
