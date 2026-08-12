#!/usr/bin/env bash
# ZAL-583: aplica la migracion de consent/demo en un Postgres efimero y
# comprueba (a) que los CHECK nuevos rechazan lo que deben, (b) que los CHECK
# preexistentes siguen intactos, y (c) que los dos denominadores se reconstruyen
# con SQL puro. Sandbox local unicamente: crea su propio cluster en un
# directorio temporal y lo destruye al salir. No toca ninguna base real.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zaltyko-zal583.XXXXXX")"
# El socket Unix de Postgres tiene un limite duro de 103 bytes, y TMPDIR bajo
# un runner puede ser mas largo que eso. El directorio de socket va aparte,
# corto y siempre bajo /tmp.
PG_SOCK_DIR="$(mktemp -d "/tmp/zal583.XXXXXX")"
PG_PORT="${ZAL583_PG_PORT:-55441}"
PG_LOG="${PG_DIR}/postgres.log"

cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "${PG_DIR}" "${PG_SOCK_DIR}"
}
trap cleanup EXIT

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-p ${PG_PORT} -k ${PG_SOCK_DIR}" -l "${PG_LOG}" start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "${PG_SOCK_DIR}" -p "${PG_PORT}" -d postgres)

"${PSQL[@]}" <<'SQL' >/dev/null
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- Stub: la politica RLS de phase4 la invoca. En sandbox nadie es super admin;
-- este script valida CHECKs y denominadores, no RLS (eso vive en
-- scripts/run-rls-semantics-local.sh).
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
SQL

echo "== aplicando esquema base + phase4 =="
"${PSQL[@]}" -f "${ROOT_DIR}/drizzle/0000_silent_tomas.sql" >/dev/null
# `commercial_interviews` referencia `leads`, que nace en la migracion lateral.
sed -n '/CREATE TABLE IF NOT EXISTS leads (/,/^);/p' \
  "${ROOT_DIR}/supabase/migrations/20260703000003_create_lateral_feature_tables.sql" \
  | "${PSQL[@]}" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/20260713170000_phase4_commercial_validation.sql" >/dev/null

echo "== aplicando 20260811160000_commercial_interviews_consent_demo.sql =="
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/20260811160000_commercial_interviews_consent_demo.sql" >/dev/null

echo "== idempotencia: segunda pasada =="
"${PSQL[@]}" -f "${ROOT_DIR}/supabase/migrations/20260811160000_commercial_interviews_consent_demo.sql" >/dev/null

echo "== columnas nuevas =="
"${PSQL[@]}" -c "\
SELECT column_name, data_type FROM information_schema.columns \
WHERE table_name='commercial_interviews' \
  AND column_name IN ('consent_at','consent_text_version','demo_started_at','demo_ended_at','attendees_count') \
ORDER BY column_name;"

echo "== completed_evidence_check sigue presente (no se toco) =="
"${PSQL[@]}" -c "\
SELECT conname FROM pg_constraint \
WHERE conrelid='commercial_interviews'::regclass \
  AND conname='commercial_interviews_completed_evidence_check';"

# Helper: espera que una sentencia falle con un CHECK concreto.
expect_violation() {
  local label="$1" constraint="$2" stmt="$3"
  local out
  if out="$("${PSQL[@]}" -c "${stmt}" 2>&1)"; then
    echo "FALLO: ${label} deberia haber sido rechazado y paso"
    exit 1
  fi
  if ! grep -q "${constraint}" <<<"${out}"; then
    echo "FALLO: ${label} fallo por otra razon: ${out}"
    exit 1
  fi
  echo "ok  ${label} -> ${constraint}"
}

BASE_COLS="academy_fingerprint, academy_name"
COMPLETED_EVIDENCE="completed_at, athlete_count, current_tools, biggest_pain, primary_objection, easy_price_eur_cents, limit_price_eur_cents"
COMPLETED_VALUES="now(), 80, 'Excel', 'Cobros', 'Migracion', 1900, 4900"

echo "== CHECKs nuevos rechazan lo invalido =="
expect_violation "consent_at sin version" \
  "commercial_interviews_consent_implies_version_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, consent_at) VALUES ('fp-a','A', now());"

expect_violation "consent_text_version con formato malo" \
  "commercial_interviews_consent_text_version_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, consent_at, consent_text_version) VALUES ('fp-b','B', now(), '1.0');"

expect_violation "attendees_count fuera de rango" \
  "commercial_interviews_attendees_count_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, attendees_count) VALUES ('fp-c','C', 51);"

expect_violation "demo terminada antes de empezar" \
  "commercial_interviews_demo_timeline_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, demo_started_at, demo_ended_at) VALUES ('fp-d','D', '2026-08-06T13:00:00Z', '2026-08-06T12:00:00Z');"

expect_violation "completed sin demo_ended_at" \
  "commercial_interviews_demo_evidence_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, status, ${COMPLETED_EVIDENCE}) VALUES ('fp-e','E', 'completed', ${COMPLETED_VALUES});"

expect_violation "completed sin evidencia previa (CHECK preexistente intacto)" \
  "commercial_interviews_completed_evidence_check" \
  "INSERT INTO commercial_interviews (${BASE_COLS}, status, demo_ended_at) VALUES ('fp-f','F', 'completed', now());"

echo "== filas validas + reconciliacion de denominadores =="
"${PSQL[@]}" <<SQL >/dev/null
INSERT INTO commercial_interviews (${BASE_COLS}, consent_at, consent_text_version)
VALUES ('fp-1','Consentida 1', '2026-08-05T10:00:00Z', 'v1-2026-08-01');

INSERT INTO commercial_interviews (${BASE_COLS}, consent_text_version)
VALUES ('fp-2','Version sin consent', 'v1-2026-08-01');

INSERT INTO commercial_interviews (${BASE_COLS}, status, ${COMPLETED_EVIDENCE}, demo_started_at, demo_ended_at, attendees_count)
VALUES ('fp-3','Demo completa 1', 'completed', ${COMPLETED_VALUES}, '2026-08-06T11:30:00Z', '2026-08-06T12:00:00Z', 1);

INSERT INTO commercial_interviews (${BASE_COLS}, status, ${COMPLETED_EVIDENCE}, demo_started_at, demo_ended_at, attendees_count)
VALUES ('fp-4','Demo completa 2', 'completed', ${COMPLETED_VALUES}, '2026-08-07T11:30:00Z', '2026-08-07T12:00:00Z', 4);

INSERT INTO commercial_interviews (${BASE_COLS}, status, demo_ended_at, attendees_count)
VALUES ('fp-5','Demo sin completar', 'scheduled', '2026-08-08T12:00:00Z', 3);

INSERT INTO commercial_interviews (${BASE_COLS}, status, ${COMPLETED_EVIDENCE}, demo_ended_at, attendees_count)
VALUES ('fp-6','Completada sin asistentes', 'completed', ${COMPLETED_VALUES}, '2026-08-09T12:00:00Z', NULL);
SQL

"${PSQL[@]}" -c "\
SELECT \
  COUNT(*) FILTER (WHERE consent_at IS NOT NULL AND consent_text_version IS NOT NULL) AS consented, \
  COUNT(*) FILTER (WHERE status = 'completed' AND demo_ended_at IS NOT NULL AND attendees_count >= 1) AS demos_held \
FROM commercial_interviews;"

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE c int; d int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE consent_at IS NOT NULL AND consent_text_version IS NOT NULL),
         COUNT(*) FILTER (WHERE status = 'completed' AND demo_ended_at IS NOT NULL AND attendees_count >= 1)
    INTO c, d FROM commercial_interviews;
  IF c <> 1 THEN RAISE EXCEPTION 'consented esperado 1, obtenido %', c; END IF;
  IF d <> 2 THEN RAISE EXCEPTION 'demos_held esperado 2, obtenido %', d; END IF;
END $$;
SQL

echo "== OK: migracion aplicada, 6 CHECKs verificados, denominadores consented=1 demos_held=2 =="
