-- Annual SaaS subscription prices are a second Stripe Price for the same plan.
-- Keep the existing monthly columns for backwards compatibility.
BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_annual_price_id text,
  ADD COLUMN IF NOT EXISTS annual_price_eur integer;

COMMENT ON COLUMN public.plans.stripe_annual_price_id IS
  'Stripe recurring yearly price for the same plan, charged once per year.';

COMMENT ON COLUMN public.plans.annual_price_eur IS
  'Annual EUR amount in cents; nullable until the annual Stripe price is configured.';

COMMIT;
