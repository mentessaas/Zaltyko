-- El índice histórico hacía único (role_id, user_id), bloqueando reutilizar
-- el mismo rol en academias distintas y no garantizando un único rol por
-- usuario dentro de su academia.
DROP INDEX IF EXISTS public.role_members_uq;
CREATE UNIQUE INDEX IF NOT EXISTS role_members_uq
  ON public.role_members (academy_id, user_id);
