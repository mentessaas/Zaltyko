#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-growth-foundation.XXXXXX")"
PG_PORT="${ZALTYKO_GROWTH_TEST_PG_PORT:-55443}"
PG_LOG="${PG_DIR}/postgres.log"

cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null
  fi
  rm -rf "${PG_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-p ${PG_PORT} -k ${PG_DIR}" -l "${PG_LOG}" start >/dev/null

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PG_DIR}" -p "${PG_PORT}" -d postgres)

"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
SQL

for migration in \
  20261006080702_establish_zaltyko_domain_foundation.sql \
  20261013100000_model_sport_profiles_and_complementary_activities.sql \
  20261006085254_add_operational_enrollment_invariants.sql \
  20261006090034_add_trials_waitlists_families.sql
do
  "${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/${migration}" >/dev/null
done

"${PSQL[@]}" -f "${ROOT_DIR}/supabase/fixtures/zaltyko_synthetic_academies.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/tests/zaltyko_growth_foundation.sql" >/dev/null

echo "Zaltyko growth foundation PostgreSQL test: PASS (synthetic single-site + multi-site fixture)"
