begin;

do $$
begin
  if not coalesce((
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'zaltyko.owner_dashboard_layouts'::regclass
  ), false) then
    raise exception 'Owner dashboard layout must use forced RLS';
  end if;
  if has_table_privilege('anon', 'zaltyko.owner_dashboard_layouts', 'select')
     or not has_table_privilege('authenticated', 'zaltyko.owner_dashboard_layouts', 'select')
     or has_table_privilege('authenticated', 'zaltyko.owner_dashboard_layouts', 'delete') then
    raise exception 'Layout privileges must be authenticated select/insert/update only';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'zaltyko' and tablename = 'owner_dashboard_layouts'
      and policyname in (
        'owner_dashboard_layouts_select_self',
        'owner_dashboard_layouts_insert_self',
        'owner_dashboard_layouts_update_self'
      ) and roles = array['authenticated']::name[]
  ) <> 3 then
    raise exception 'Self-scoped authenticated RLS policies are incomplete';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000101', true);
insert into zaltyko.owner_dashboard_layouts (
  organization_id, user_id, module_order
) values (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101',
  array['operations', 'kpis', 'trends', 'explanation']
);

do $$
begin
  if (select count(*) from zaltyko.owner_dashboard_layouts) <> 1 then
    raise exception 'Owner must be able to read their own layout';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000101', true);
do $$
begin
  if (select count(*) from zaltyko.owner_dashboard_layouts) <> 0 then
    raise exception 'Other academy owner must not see this layout';
  end if;
end
$$;

rollback;
