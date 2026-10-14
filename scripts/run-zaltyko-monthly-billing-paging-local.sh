#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFE_PATH="${PATH}"
case "${ZALTYKO_MONTHLY_BILLING_PAGING_CASE:-full}" in
  full)
    VERIFIER_SCRIPT="scripts/verify-zaltyko-monthly-billing-paging-local.ts"
    MIGRATION_PROFILE="monthly"
    USE_VERIFIER_WATCHDOG=0
    ;;
  options)
    VERIFIER_SCRIPT="scripts/verify-zaltyko-monthly-invoice-options-local.ts"
    MIGRATION_PROFILE="monthly"
    USE_VERIFIER_WATCHDOG=0
    ;;
  retention)
    VERIFIER_SCRIPT="scripts/verify-zaltyko-retention-location-batches-local.ts"
    MIGRATION_PROFILE="retention"
    USE_VERIFIER_WATCHDOG=1
    ;;
  *)
    echo "Unsupported local harness case; allowed values: full, options, retention" >&2
    exit 2
    ;;
esac
RUN_DIR="$(mktemp -d /tmp/zaltyko-monthly-paging.XXXXXX)"
PG_DATA="${RUN_DIR}/data"
python_clean() {
  env -i "PATH=${SAFE_PATH}" "HOME=${RUN_DIR}" LC_ALL=C python3 -I "$@"
}

node_clean() {
  env -i "PATH=${SAFE_PATH}" "HOME=${RUN_DIR}" LC_ALL=C "${NODE_BIN}" "$@"
}

PG_PORT="$(python_clean - <<'PY'
import socket

with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    print(probe.getsockname()[1])
PY
)"
PG_START_ATTEMPTED=0

run_clean() {
  env -i "PATH=${SAFE_PATH}" LC_ALL=C "$@"
}

psql_db() {
  local database="$1"
  shift
  run_clean psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${PG_PORT}" \
    -U postgres -d "${database}" "$@"
}

cleanup() {
  local result=$?
  local preserve_dir=0
  local status=0
  trap - EXIT
  set +e

  if ((PG_START_ATTEMPTED == 1)); then
    run_clean pg_ctl -D "${PG_DATA}" status >/dev/null 2>&1
    status=$?
    if ((status == 0)); then
      run_clean pg_ctl -D "${PG_DATA}" -m fast stop >/dev/null 2>&1
      if (($? != 0)); then
        preserve_dir=1
      else
        run_clean pg_ctl -D "${PG_DATA}" status >/dev/null 2>&1
        status=$?
        if ((status != 3)) || [[ -f "${PG_DATA}/postmaster.pid" ]]; then
          preserve_dir=1
        fi
      fi
    else
      if ((status != 3)) || [[ -f "${PG_DATA}/postmaster.pid" ]]; then
        preserve_dir=1
      fi
    fi
  fi

  if ((preserve_dir == 0)); then
    if [[ "$(dirname -- "${RUN_DIR}")" == "/tmp" &&
          "$(basename -- "${RUN_DIR}")" == zaltyko-monthly-paging.* &&
          -d "${RUN_DIR}" && ! -L "${RUN_DIR}" ]]; then
      rm -rf -- "${RUN_DIR}"
      if (($? != 0)); then preserve_dir=1; fi
    else
      echo "Refusing to remove unexpected temporary path: ${RUN_DIR}" >&2
      preserve_dir=1
    fi
  fi

  if ((preserve_dir == 0)); then
    echo "monthly billing paging cleanup: PASS" >&2
  else
    echo "monthly billing paging cleanup: FAIL; recovery path: ${RUN_DIR}" >&2
    result=1
  fi
  exit "${result}"
}
trap cleanup EXIT

for command in initdb postgres pg_ctl psql python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required local tool not found: ${command}" >&2
    exit 1
  fi
done

NODE_BIN=""
TSX_CLI=""
if ((USE_VERIFIER_WATCHDOG == 1)); then
  NODE_BIN="$(command -v node || true)"
  if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
    echo "Required local Node.js executable not found" >&2
    exit 1
  fi
  NODE_BIN="$(python_clean -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${NODE_BIN}")"
  if [[ ! -x "${NODE_BIN}" ]] || ! node_clean -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12);
    process.exit(supported ? 0 : 1);
  '; then
    echo "Node.js must satisfy the project engine range: ^20.19 or >=22.12 <23" >&2
    exit 1
  fi

  TSX_CLI="${ROOT_DIR}/node_modules/tsx/dist/cli.mjs"
  TSX_PACKAGE_JSON="${ROOT_DIR}/node_modules/tsx/package.json"
  TSX_LOCK_VERSION="$(awk '
    /^  tsx@[0-9]/ {
      sub(/^  tsx@/, "");
      sub(/:.*/, "");
      print;
      exit;
    }
  ' "${ROOT_DIR}/pnpm-lock.yaml")"
  TSX_INSTALLED_VERSION="$(node_clean -e \
    'process.stdout.write(require(process.argv[1]).version)' \
    "${TSX_PACKAGE_JSON}" 2>/dev/null || true)"
  TSX_CLI_REALPATH="$(python_clean -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${TSX_CLI}")"
  TSX_PACKAGE_ROOT="$(python_clean -c 'import os,sys; print(os.path.dirname(os.path.realpath(sys.argv[1])))' "${TSX_PACKAGE_JSON}")"
  if [[ ! -f "${TSX_CLI}" ||
        ! "${TSX_LOCK_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ||
        "${TSX_INSTALLED_VERSION}" != "${TSX_LOCK_VERSION}" ||
        "${TSX_CLI_REALPATH}" != "${TSX_PACKAGE_ROOT}/dist/cli.mjs" ]]; then
    echo "Installed tsx CLI does not match the locked dependency in pnpm-lock.yaml" >&2
    exit 1
  fi
else
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "Required local tool not found: pnpm" >&2
    exit 1
  fi
  if [[ ! -x "${ROOT_DIR}/node_modules/.bin/tsx" ]]; then
    echo "Local tsx dependency missing; install project dependencies before running this harness" >&2
    exit 1
  fi
fi

pg_tool_major_version() {
  run_clean "$1" --version | sed -E 's/^[^0-9]*([0-9]+)(\.[0-9]+)*.*$/\1/'
}

for command in initdb postgres pg_ctl psql; do
  version="$(pg_tool_major_version "${command}")"
  if [[ "${version}" != "17" ]]; then
    echo "PostgreSQL 17 is required; ${command} reports ${version}" >&2
    exit 1
  fi
done

if [[ "${MIGRATION_PROFILE}" == "retention" ]]; then
  MIGRATIONS=(
    20261006080702_establish_zaltyko_domain_foundation.sql
    20261006085254_add_operational_enrollment_invariants.sql
    20261006094607_add_versioned_metric_engine.sql
    20261006165917_owner_cohort_retention_projections.sql
  )
else
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
fi

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "${ROOT_DIR}/supabase/migrations/${migration}" ]]; then
    echo "Required migration missing: ${migration}" >&2
    exit 1
  fi
done

run_clean initdb -D "${PG_DATA}" -U postgres -A trust --no-locale -E UTF8 \
  >/dev/null
PG_START_ATTEMPTED=1
if ! run_clean pg_ctl -D "${PG_DATA}" \
  -o "-h 127.0.0.1 -p ${PG_PORT} -c listen_addresses=127.0.0.1" \
  -l "${RUN_DIR}/postgres.log" start >/dev/null; then
  echo "Disposable PostgreSQL 17 startup failed:" >&2
  tail -n 20 "${RUN_DIR}/postgres.log" >&2
  exit 1
fi

psql_db postgres <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
SQL

for migration in "${MIGRATIONS[@]}"; do
  psql_db postgres -f "${ROOT_DIR}/supabase/migrations/${migration}" \
    >/dev/null
done

HARNESS_DATABASE_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/postgres?statement_timeout=8000&lock_timeout=4000"
VERIFIER_ENV=(
  "PATH=${SAFE_PATH}"
  "HOME=${RUN_DIR}"
  "DATABASE_URL=${HARNESS_DATABASE_URL}"
  "DATABASE_URL_POOL=${HARNESS_DATABASE_URL}"
  "DATABASE_URL_DIRECT=${HARNESS_DATABASE_URL}"
  "DATABASE_POOL_MAX=6"
  "DOTENV_CONFIG_PATH=/dev/null"
  "NODE_ENV=test"
  "ZALTYKO_MONTHLY_BILLING_PAGING_PORT=${PG_PORT}"
  "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL=1"
)
if ((USE_VERIFIER_WATCHDOG == 1)); then
  env -i "${VERIFIER_ENV[@]}" \
    python3 -I "${ROOT_DIR}/scripts/run-zaltyko-verifier-with-deadline.py" -- \
    "${NODE_BIN}" "${TSX_CLI_REALPATH}" "${ROOT_DIR}/${VERIFIER_SCRIPT}"
else
  env -i "${VERIFIER_ENV[@]}" \
    pnpm --dir "${ROOT_DIR}" exec tsx "${VERIFIER_SCRIPT}"
fi
