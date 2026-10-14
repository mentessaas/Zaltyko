#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
RUN_DIR="$(mktemp -d /tmp/zaltyko-restore.XXXXXX)"
PG_DATA="${RUN_DIR}/data"
PG_PORT="$(python3 - <<'PY'
import socket

with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    print(probe.getsockname()[1])
PY
)"
SAFE_PATH="${PATH}"
SOURCE_DB="zaltyko_restore_source"
TARGET_DB="zaltyko_restore_target"
SOURCE_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/${SOURCE_DB}"
TARGET_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/${TARGET_DB}"
DUMP_FILE="${RUN_DIR}/source.dump"
MIGRATION_MANIFEST="${RUN_DIR}/migrations.sha256"

MIGRATIONS=(
  20261006080702_establish_zaltyko_domain_foundation.sql
  20261006131000_add_organization_default_currency.sql
  20261013100000_model_sport_profiles_and_complementary_activities.sql
  20261006085254_add_operational_enrollment_invariants.sql
  20261013170001_record_group_membership_history.sql
  20261006090034_add_trials_waitlists_families.sql
  20261006093047_add_internal_billing_ledger.sql
  20261013082806_organization_payment_accounts.sql
  20261013160000_canonical_family_collection_and_entitlements.sql
  20261013235142_owner_signup_consent_canonical.sql
  20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql
)

run_clean() {
  env -i "PATH=${SAFE_PATH}" "$@"
}

psql_db() {
  local database="$1"
  shift
  run_clean psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${PG_PORT}" \
    -U postgres -d "${database}" "$@"
}

cleanup() {
  local result=$?
  local cleanup_failed=0
  trap - EXIT
  set +e

  if [[ -f "${PG_DATA}/postmaster.pid" ]]; then
    run_clean pg_ctl -D "${PG_DATA}" -m fast stop >/dev/null 2>&1
    [[ $? -eq 0 ]] || cleanup_failed=1
  fi
  rm -rf -- "${RUN_DIR}"
  [[ $? -eq 0 ]] || cleanup_failed=1

  if ((cleanup_failed == 0)); then
    echo "synthetic restore cleanup: PASS" >&2
  else
    echo "synthetic restore cleanup: FAIL" >&2
    result=1
  fi
  exit "${result}"
}
trap cleanup EXIT

for command in initdb pg_ctl psql createdb pg_dump pg_restore shasum python3 pnpm; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required local tool not found: ${command}" >&2
    exit 1
  fi
done

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "${ROOT_DIR}/supabase/migrations/${migration}" ]]; then
    echo "Required migration missing: ${migration}" >&2
    exit 1
  fi
done

run_clean initdb -D "${PG_DATA}" -U postgres -A trust --no-locale -E UTF8 >/dev/null
run_clean pg_ctl -D "${PG_DATA}" \
  -o "-h 127.0.0.1 -p ${PG_PORT} -c listen_addresses=127.0.0.1" \
  -l "${RUN_DIR}/postgres.log" start >/dev/null
psql_db postgres <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
SQL

run_clean createdb -h 127.0.0.1 -p "${PG_PORT}" -U postgres "${SOURCE_DB}"
run_clean createdb -h 127.0.0.1 -p "${PG_PORT}" -U postgres "${TARGET_DB}"

psql_db "${SOURCE_DB}" <<'SQL' >/dev/null
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

for migration in "${MIGRATIONS[@]}"; do
  psql_db "${SOURCE_DB}" -f "${ROOT_DIR}/supabase/migrations/${migration}" \
    >/dev/null
done

{
  cd "${ROOT_DIR}"
  for migration in "${MIGRATIONS[@]}"; do
    shasum -a 256 "supabase/migrations/${migration}"
  done
} >"${MIGRATION_MANIFEST}"
MIGRATION_MANIFEST_SHA256="$(shasum -a 256 "${MIGRATION_MANIFEST}" | awk '{print $1}')"

env -i "PATH=${SAFE_PATH}" \
  DATABASE_URL="${SOURCE_URL}" \
  DATABASE_URL_POOL="${SOURCE_URL}" \
  DATABASE_URL_DIRECT="${SOURCE_URL}" \
  pnpm exec tsx scripts/verify-zaltyko-operational-services.ts

psql_db "${SOURCE_DB}" <<'SQL' >/dev/null
insert into zaltyko.owner_signup_consents (
  user_id, state, policy_version, source, consent_proof
) values (
  '10000000-0000-4000-8000-000000000001', 'granted',
  'v1-2026-08-01', 'setup', 'setup:restore-synthetic-owner'
);
insert into zaltyko.owner_signup_consent_audits (
  user_id, event, policy_version, source, consent_proof
) values (
  '10000000-0000-4000-8000-000000000001', 'grant',
  'v1-2026-08-01', 'setup', 'setup:restore-synthetic-owner'
);
SQL

run_clean pg_dump -h 127.0.0.1 -p "${PG_PORT}" -U postgres \
  --format=custom --no-owner --dbname="${SOURCE_DB}" --file="${DUMP_FILE}"
if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "Local backup is empty" >&2
  exit 1
fi
shasum -a 256 "${DUMP_FILE}" >"${DUMP_FILE}.sha256"
run_clean shasum -a 256 -c "${DUMP_FILE}.sha256" >/dev/null
run_clean pg_restore --exit-on-error --no-owner --dbname="${TARGET_URL}" \
  "${DUMP_FILE}"

run_clean pg_dump -h 127.0.0.1 -p "${PG_PORT}" -U postgres \
  --schema-only --no-owner --dbname="${SOURCE_DB}" \
  --file="${RUN_DIR}/source-schema.sql"
run_clean pg_dump -h 127.0.0.1 -p "${PG_PORT}" -U postgres \
  --schema-only --no-owner --dbname="${TARGET_DB}" \
  --file="${RUN_DIR}/target-schema.sql"
cmp -s "${RUN_DIR}/source-schema.sql" "${RUN_DIR}/target-schema.sql"

env -i "PATH=${SAFE_PATH}" \
  RESTORE_SOURCE_DATABASE_URL="${SOURCE_URL}" \
  RESTORE_TARGET_DATABASE_URL="${TARGET_URL}" \
  pnpm exec tsx scripts/verify-zaltyko-synthetic-restore-local.ts

DUMP_SHA256="$(shasum -a 256 "${DUMP_FILE}" | awk '{print $1}')"
printf '{"status":"PASS","scope":"two loopback databases","migrationCount":%s,"migrationManifestSha256":"%s","dumpSha256":"%s","schemaDump":"identical"}\n' \
  "${#MIGRATIONS[@]}" "${MIGRATION_MANIFEST_SHA256}" "${DUMP_SHA256}"
