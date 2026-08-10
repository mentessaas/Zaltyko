#!/usr/bin/env bash
set -euo pipefail

# Levanta un cluster PostgreSQL efímero local y corre el test de concurrencia
# del cobro (ZAL-6). El test prueba que `pg_advisory_xact_lock(hashtext(chargeId))`
# realmente serializa dos invocaciones concurrentes de `collectCharge` contra el
# mismo cargo: solo uno llega a llamar a Stripe `paymentIntents.create`, el
# segundo ve el cargo ya pagado y devuelve `NOT_COLLECTIBLE:paid`. Cierra el
# hueco crítico documentado en `tests/lib/stripe-charge-collection.integration.test.ts`.
#
# No toca producción, no usa Supabase remoto, no aplica migraciones reales.
# El cluster Postgres se destruye al terminar el script.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Postgres limita el path del Unix socket a 103 bytes. macOS pone TMPDIR
# bajo /var/folders/... que se vuelve demasiado largo al añadir el socket
# name; usamos /tmp directamente para no cruzarnos con ese límite.
PG_DIR="/tmp/zaltyko-charge-conc-$$-${RANDOM}"
mkdir -p "${PG_DIR}"
PG_PORT="${CHARGE_CONCURRENCY_PG_PORT:-55440}"
PG_LOG="${PG_DIR}/postgres.log"

cleanup() {
  if [[ -f "${PG_DIR}/postmaster.pid" ]]; then
    pg_ctl -D "${PG_DIR}" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "${PG_DIR}"
}
trap cleanup EXIT

if ! command -v initdb >/dev/null 2>&1; then
  echo "Postgres no disponible (initdb). Instálalo con Homebrew y vuelve a correr." >&2
  exit 1
fi

initdb -D "${PG_DIR}" -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "${PG_DIR}" -o "-p ${PG_PORT} -k ${PG_DIR}" -l "${PG_LOG}" start >/dev/null

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PG_DIR}" -p "${PG_PORT}" -d postgres)

# Schema mínimo necesario para collectCharge. No creamos todas las tablas del
# proyecto (ni enums ajenos a cobro) ni RLS — el test solo necesita poder
# insertar/seleccionar `academies`, `athletes`, `charges`, `payment_attempts`
# con la forma exacta que `charge-collection-service.ts` espera. Mantenemos
# los FK y los enums reales para que las queries Drizzle no difieran de
# producción.
"${PSQL[@]}" -q <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.charge_status AS ENUM (
  'pending', 'paid', 'overdue', 'cancelled', 'partial', 'failed', 'refunded'
);
CREATE TYPE public.payment_method AS ENUM (
  'cash', 'transfer', 'bizum', 'card_manual', 'other', 'card'
);
CREATE TYPE public.profile_role AS ENUM (
  'super_admin', 'admin', 'owner', 'coach', 'athlete', 'parent', 'provider'
);
CREATE TYPE public.academy_type AS ENUM (
  'artistica', 'ritmica', 'trampolin', 'general', 'parkour', 'danza'
);

CREATE TABLE public.academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  academy_type public.academy_type NOT NULL DEFAULT 'general',
  is_public boolean NOT NULL DEFAULT true
);

CREATE TABLE public.athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  billing_item_id uuid REFERENCES public.billing_items(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  label text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  period text NOT NULL,
  due_date date,
  status public.charge_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method,
  paid_at timestamp with time zone,
  notes text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_account_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  stripe_account_id text,
  status text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  error_code text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX charges_academy_period_idx ON public.charges (academy_id, period);
CREATE INDEX charges_academy_status_idx ON public.charges (academy_id, status);
CREATE INDEX payment_attempts_charge_idx ON public.payment_attempts (charge_id);
SQL

# El test se auto-skippea si CHARGE_CONCURRENCY_TEST=1 no está fijado. Exportar
# el flag y la URL del cluster efímero bajo un nombre dedicado: el setup de
# vitest (`tests/setup.ts`) sobreescribe `DATABASE_URL` con valores "test", y
# usar un nombre dedicado evita esa colisión.
export CHARGE_CONCURRENCY_TEST=1
export CHARGE_CONCURRENCY_DATABASE_URL="postgresql://127.0.0.1:${PG_PORT}/postgres?connection_limit=4"
export DATABASE_POOL_MAX=4

cd "${ROOT_DIR}"
echo "Cluster efímero en puerto ${PG_PORT} — arrancando concurrencia collectCharge..."
pnpm exec vitest run \
  tests/lib/stripe-charge-collection-concurrency.real-pg.test.ts
