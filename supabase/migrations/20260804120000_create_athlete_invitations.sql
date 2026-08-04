-- ZAL-138: Tabla para invitaciones "first athletes" vía Supabase magic links.
-- Una invitación representa un único email invitado por una academia concreta.
-- El flujo de "confirmado" requiere dos eventos separados:
--   1. magic link abierto  → status pasa a 'opened' (Supabase consume el OTP).
--   2. perfil de atleta completo → status pasa a 'profile_complete' y se crea
--      la fila en athletes.
-- El state_token interno NO es el OTP de Supabase: nunca se expone en la URL
-- pública de magic link (sólo se usa tras verifyOtp, en una fase interna).

CREATE TABLE IF NOT EXISTS public.athlete_invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id          uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL,
  email               text NOT NULL,
  invited_by          uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','opened','profile_complete','cancelled','expired')),
  -- Token interno que vincula el callback de Supabase con la invitación.
  -- Se genera en backend, se pasa como ?state=<token> en la redirectTo del
  -- magic link. NO se reutiliza una vez consumido.
  state_token         text NOT NULL UNIQUE,
  custom_message      text,
  sent_at             timestamptz,
  opened_at           timestamptz,
  profile_completed_at timestamptz,
  -- supabase_user_id se setea cuando el magic link se abre con éxito
  -- (verifyOtp) y enlaza la fila con el perfil creado en auth.users.
  supabase_user_id    uuid,
  -- athlete_id se setea cuando el invitado completa su perfil y se crea la
  -- fila en athletes.
  athlete_id          uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  expires_at          timestamptz NOT NULL,
  resend_count        integer NOT NULL DEFAULT 0,
  last_resent_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Idempotencia a nivel de academia+email: si ya hay una invitación activa
-- (no terminal) para la misma academia+email, el backend la reusa en lugar
-- de crear duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS athlete_invitations_active_unique
  ON public.athlete_invitations (academy_id, lower(email))
  WHERE status IN ('pending','opened');

CREATE INDEX IF NOT EXISTS athlete_invitations_academy_status_idx
  ON public.athlete_invitations (academy_id, status);

CREATE INDEX IF NOT EXISTS athlete_invitations_tenant_idx
  ON public.athlete_invitations (tenant_id);

CREATE INDEX IF NOT EXISTS athlete_invitations_supabase_user_idx
  ON public.athlete_invitations (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.athlete_invitations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_invitations_set_updated_at ON public.athlete_invitations;
CREATE TRIGGER athlete_invitations_set_updated_at
  BEFORE UPDATE ON public.athlete_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.athlete_invitations_set_updated_at();

-- RLS: defense-in-depth. El server conecta como postgres con BYPASSRLS,
-- pero si alguna vez un cliente Supabase accede directo (auth.uid() != null)
-- sólo el dueño de la academia o super_admin puede leer/escribir sus filas.
ALTER TABLE public.athlete_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_invitations_owner_read ON public.athlete_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.academy_id = athlete_invitations.academy_id
        AND m.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY athlete_invitations_owner_modify ON public.athlete_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.academy_id = athlete_invitations.academy_id
        AND m.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- No se otorgan grants a anon/authenticated: el server es el único que toca
-- esta tabla vía BYPASSRLS. La policy queda como red de seguridad si en el
-- futuro se publica alguna ruta cliente.