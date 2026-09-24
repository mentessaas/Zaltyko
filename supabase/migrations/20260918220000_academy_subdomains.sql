-- 20260918220000_academy_subdomains.sql
-- T6 — Soporte para subdominios [slug].zaltyko.com.
-- Añade flag subdomain_enabled en academies. El slug es el mismo public_slug
-- (validado como subdomain-safe: lowercase, sin puntos, sin guiones dobles).

ALTER TABLE "academies"
  ADD COLUMN IF NOT EXISTS "subdomain_enabled" boolean NOT NULL DEFAULT false;

-- Índice para acelerar lookup por subdomain (que es public_slug)
CREATE UNIQUE INDEX IF NOT EXISTS "academies_subdomain_enabled_uq"
  ON "academies" ("public_slug")
  WHERE "subdomain_enabled" = true;

-- Comentario: el middleware de Next.js detecta el host `*.zaltyko.com` y
-- reescribe internamente a `/a/[slug]`. La academia activa el flag desde su
-- panel admin cuando quiera tener presencia con subdominio propio.
