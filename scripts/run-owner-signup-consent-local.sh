#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_PORT="${ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT:-55491}"
if [[ ! "${PG_PORT}" =~ ^[0-9]{1,5}$ ]] || ((PG_PORT < 1024 || PG_PORT > 65535)); then
  echo "ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT must be between 1024 and 65535" >&2
  exit 1
fi
PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-owner-signup-consent.XXXXXX")"
cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null
  fi
  rm -rf -- "${PG_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-h 127.0.0.1 -p ${PG_PORT} -k ${PG_DIR}" -l "${PG_DIR}/postgres.log" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${PG_PORT}" -d postgres)
"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA zaltyko;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA zaltyko TO authenticated, service_role;
SQL

"${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/20261013235142_owner_signup_consent_canonical.sql" >/dev/null
"${PSQL[@]}" <<'SQL'
INSERT INTO auth.users (id, created_at) VALUES
  ('f0a8d116-459b-4e4c-b4d0-865f63180123', '2026-10-13T10:00:00Z'),
  ('f0a8d116-459b-4e4c-b4d0-865f63180124', clock_timestamp()),
  ('f0a8d116-459b-4e4c-b4d0-865f63180125', clock_timestamp()),
  ('f0a8d116-459b-4e4c-b4d0-865f63180126', clock_timestamp());
CREATE FUNCTION zaltyko.fail_owner_signup_audit_for_test() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = 'f0a8d116-459b-4e4c-b4d0-865f63180126'::uuid THEN
    RAISE EXCEPTION 'simulated audit failure';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER fail_owner_signup_audit_for_test
BEFORE INSERT ON zaltyko.owner_signup_consent_audits
FOR EACH ROW EXECUTE FUNCTION zaltyko.fail_owner_signup_audit_for_test();
SQL

LOCAL_URL="postgresql://127.0.0.1:${PG_PORT}/postgres"
ZALTYKO_OWNER_SIGNUP_CONSENT_LOCAL_PG=1 \
ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT="${PG_PORT}" \
DATABASE_URL="${LOCAL_URL}" \
DATABASE_URL_POOL="${LOCAL_URL}" \
DATABASE_URL_DIRECT="${LOCAL_URL}" \
DATABASE_POOL_MAX=8 NODE_ENV=test \
  pnpm --dir "${ROOT_DIR}" exec tsx scripts/verify-owner-signup-consent-local.ts
