-- ZAL-541 — normalización puntual de dos filas residuo de subscriptions.
-- Aprobación board: ebc84617-ba8a-4cfd-bb87-07d3d11b7b8d.
-- No DELETE. Reejecución segura: una fila ya canceled no vuelve a mutar.
-- Rollback manual autorizado únicamente mediante UPDATE ... SET status='active'.

DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT count(*)
  INTO target_count
  FROM public.subscriptions
  WHERE id IN (
    'c11647ca-9a8a-46b2-8315-83101690c93a'::uuid,
    'edba403a-bb51-42d6-9822-874492358b0e'::uuid
  );

  IF target_count <> 2 THEN
    RAISE EXCEPTION
      'ZAL-541 abortado: se esperaban 2 filas objetivo y se encontraron %',
      target_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE id IN (
      'c11647ca-9a8a-46b2-8315-83101690c93a'::uuid,
      'edba403a-bb51-42d6-9822-874492358b0e'::uuid
    )
    AND (
      stripe_subscription_id IS NOT NULL
      OR (
        status IS DISTINCT FROM 'active'
        AND status IS DISTINCT FROM 'canceled'
      )
    )
  ) THEN
    RAISE EXCEPTION
      'ZAL-541 abortado: una fila objetivo no está en estado active/canceled sin stripe_subscription_id';
  END IF;
END
$$;

SELECT
  'before' AS snapshot_phase,
  clock_timestamp() AS snapshot_at,
  id,
  user_id,
  plan_id,
  status,
  stripe_subscription_id,
  stripe_customer_id,
  stripe_price_id,
  updated_at,
  created_at
FROM public.subscriptions
WHERE id IN (
  'c11647ca-9a8a-46b2-8315-83101690c93a'::uuid,
  'edba403a-bb51-42d6-9822-874492358b0e'::uuid
)
ORDER BY id;

UPDATE public.subscriptions
SET
  status = 'canceled',
  updated_at = now()
WHERE id IN (
  'c11647ca-9a8a-46b2-8315-83101690c93a'::uuid,
  'edba403a-bb51-42d6-9822-874492358b0e'::uuid
)
AND status = 'active'
AND stripe_subscription_id IS NULL
RETURNING
  'updated' AS snapshot_phase,
  clock_timestamp() AS snapshot_at,
  id,
  user_id,
  plan_id,
  status,
  stripe_subscription_id,
  stripe_customer_id,
  stripe_price_id,
  updated_at,
  created_at;

SELECT
  'after' AS snapshot_phase,
  clock_timestamp() AS snapshot_at,
  id,
  user_id,
  plan_id,
  status,
  stripe_subscription_id,
  stripe_customer_id,
  stripe_price_id,
  updated_at,
  created_at
FROM public.subscriptions
WHERE id IN (
  'c11647ca-9a8a-46b2-8315-83101690c93a'::uuid,
  'edba403a-bb51-42d6-9822-874492358b0e'::uuid
)
ORDER BY id;
