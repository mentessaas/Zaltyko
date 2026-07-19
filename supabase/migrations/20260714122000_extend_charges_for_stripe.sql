-- Cobros y cuotas (FASE 3): extender el ledger charges para cobro con tarjeta.
--
-- El ledger charges sigue siendo la unica fuente de verdad. Se anaden campos de
-- referencia a Stripe (cuenta conectada) y estados failed/refunded, y el metodo
-- 'card' (tarjeta automatica, distinto de 'card_manual'). Idempotente.

-- Nuevos estados del cargo. ADD VALUE IF NOT EXISTS es idempotente (PG12+).
ALTER TYPE "charge_status" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "charge_status" ADD VALUE IF NOT EXISTS 'refunded';

-- Nuevo metodo de pago: tarjeta automatica via Stripe.
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'card';

-- Campos de referencia a Stripe en el cargo.
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text;
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "stripe_charge_id" text;
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "stripe_account_id" text;
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamptz;

CREATE INDEX IF NOT EXISTS "charges_payment_intent_idx"
  ON "charges" USING btree ("stripe_payment_intent_id");
