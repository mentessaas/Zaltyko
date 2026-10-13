#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_PORT="${ZALTYKO_OWNER_CONSENT_TEST_PG_PORT:-55489}"
if [[ ! "${PG_PORT}" =~ ^[0-9]{1,5}$ ]] || ((PG_PORT < 1024 || PG_PORT > 65535)); then
  echo "ZALTYKO_OWNER_CONSENT_TEST_PG_PORT must be between 1024 and 65535" >&2
  exit 1
fi
PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-owner-consent.XXXXXX")"

cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null
  fi
  rm -r -- "${PG_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-h 127.0.0.1 -p ${PG_PORT} -k ${PG_DIR}" -l "${PG_DIR}/postgres.log" start >/dev/null

PSQL=(psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${PG_PORT}" -d postgres)
"${PSQL[@]}" <<'SQL'
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY
);
CREATE TABLE app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO app_config (key, value)
VALUES ('consent.policy_version', 'v1-2026-08-01');

CREATE TABLE owner_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES profiles(user_id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('granted', 'revoked')),
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE owner_consent_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  event text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  actor text NOT NULL
);

CREATE FUNCTION fail_consent_audit_for_test() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id = 'f0a8d116-459b-4e4c-b4d0-865f63180124'::uuid THEN
    RAISE EXCEPTION 'simulated audit failure';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER fail_consent_audit_for_test
BEFORE INSERT ON owner_consent_audit
FOR EACH ROW EXECUTE FUNCTION fail_consent_audit_for_test();

INSERT INTO profiles (user_id) VALUES
  ('f0a8d116-459b-4e4c-b4d0-865f63180123'),
  ('f0a8d116-459b-4e4c-b4d0-865f63180124');
SQL

ZALTYKO_OWNER_CONSENT_LOCAL_PG=1 \
ZALTYKO_OWNER_CONSENT_TEST_PG_PORT="${PG_PORT}" \
DATABASE_URL="postgresql://127.0.0.1:${PG_PORT}/postgres" \
DATABASE_URL_POOL="postgresql://127.0.0.1:${PG_PORT}/postgres" \
DATABASE_URL_DIRECT="postgresql://127.0.0.1:${PG_PORT}/postgres" \
DATABASE_POOL_MAX=4 NODE_ENV=test \
  pnpm --dir "${ROOT_DIR}" exec tsx scripts/verify-owner-consent-store-local.ts
