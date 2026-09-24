-- Protege role_members contra referencias huérfanas. La auditoría previa
-- confirmó cero filas inválidas en producción antes de aplicar estas FKs.
ALTER TABLE public.role_members
  ADD CONSTRAINT role_members_role_fk
    FOREIGN KEY (role_id) REFERENCES public.academy_roles(id) ON DELETE CASCADE,
  ADD CONSTRAINT role_members_user_fk
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  ADD CONSTRAINT role_members_academy_fk
    FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
