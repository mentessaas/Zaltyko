-- CANDIDATE ONLY. Do not apply to staging or production without explicit authorization.
-- Adds each organization's private logo to Settings and its diplomas.
-- The actual file lives in Storage; deleting SQL rows does not delete Storage objects.

begin;

alter table zaltyko.organizations
  add column if not exists logo_path text;

do $organization_logo_path_check$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_logo_path_scope'
      and conrelid = 'zaltyko.organizations'::regclass
  ) then
    alter table zaltyko.organizations
      add constraint organizations_logo_path_scope
      check (
        logo_path is null
        or logo_path ~ ('^' || id::text || '/logo\.(jpg|png|webp)$')
      );
  end if;
end
$organization_logo_path_check$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  false,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- All reads and writes go through handlers that authorize the organization
-- and use service_role. Auth clients get no direct access even if another
-- permissive policy is later added for storage.objects.
drop policy if exists organization_logos_server_only on storage.objects;
create policy organization_logos_server_only
  on storage.objects
  as restrictive
  for all
  to public
  using (bucket_id <> 'organization-logos')
  with check (bucket_id <> 'organization-logos');

commit;
