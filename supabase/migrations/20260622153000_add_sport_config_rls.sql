alter table academy_sport_configs enable row level security;
alter table athlete_sport_configs enable row level security;
alter table coach_sport_configs enable row level security;

drop policy if exists "academy_sport_configs_tenant_access" on academy_sport_configs;
create policy "academy_sport_configs_tenant_access" on academy_sport_configs
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists "athlete_sport_configs_tenant_access" on athlete_sport_configs;
create policy "athlete_sport_configs_tenant_access" on athlete_sport_configs
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists "coach_sport_configs_tenant_access" on coach_sport_configs;
create policy "coach_sport_configs_tenant_access" on coach_sport_configs
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());
