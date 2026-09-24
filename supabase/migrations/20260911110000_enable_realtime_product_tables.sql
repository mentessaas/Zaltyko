-- Realtime is part of the product contract. Keep the publication limited to
-- tables consumed by client subscriptions; all of them retain RLS policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'notifications',
    'profiles',
    'subscriptions',
    'academies',
    'classes',
    'billing_invoices',
    'contact_messages',
    'athletes',
    'coaches',
    'groups',
    'group_athletes',
    'class_sessions',
    'class_coach_assignments',
    'athlete_assessments',
    'audit_logs'
  ] loop
    if to_regclass('public.' || table_name) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
