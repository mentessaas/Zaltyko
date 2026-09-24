CREATE UNIQUE INDEX IF NOT EXISTS refunds_stripe_refund_id_unique
  ON public.refunds (stripe_refund_id);
