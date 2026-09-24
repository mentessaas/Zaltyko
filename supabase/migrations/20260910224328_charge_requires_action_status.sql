-- Preserve Stripe 3DS state so automatic collection never retries a payment
-- that is waiting for explicit customer authentication.
ALTER TYPE public.charge_status
  ADD VALUE IF NOT EXISTS 'requires_action';
