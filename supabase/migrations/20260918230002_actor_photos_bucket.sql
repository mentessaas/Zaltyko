-- 20260918230002_actor_photos_bucket.sql
-- T8.5 — Bucket público para fotos de actor_pages (logos de academia/coach/athlete/supplier).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'actor-photos',
  'actor-photos',
  true,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: solo el owner del entity puede subir/modificar/borrar
-- Lectura pública para todos (es una URL pública que va en la página pública).

CREATE POLICY "actor_photos_owner_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'actor-photos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "actor_photos_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'actor-photos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "actor_photos_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'actor-photos'
    AND auth.uid() IS NOT NULL
  );
