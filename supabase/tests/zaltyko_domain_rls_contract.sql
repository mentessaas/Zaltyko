do $$
declare
  unprotected_tables text[];
begin
  select array_agg(format('%I.%I', namespace.nspname, relation.relname) order by relation.relname)
  into unprotected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relkind = 'r'
    and (not relation.relrowsecurity or not relation.relforcerowsecurity);

  if unprotected_tables is not null then
    raise exception 'Greenfield domain tables must enable and force RLS: %', unprotected_tables;
  end if;
end;
$$;
