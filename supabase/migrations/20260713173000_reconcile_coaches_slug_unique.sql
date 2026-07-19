-- Cierre no destructivo de drift historico entre Drizzle y Supabase.
-- El constraint ya forma parte de drizzle/0000 y src/db/schema/coaches.ts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.coaches
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede crear coaches_slug_unique: existen slugs duplicados';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coaches'::regclass
      AND conname = 'coaches_slug_unique'
  ) THEN
    ALTER TABLE public.coaches
      ADD CONSTRAINT coaches_slug_unique UNIQUE (slug);
  END IF;
END
$$;
