-- Zaltyko pricing catalog and additional location quantity.
-- Candidate only: never replay or apply without separate review and authorization.
begin;

alter table public.plans
  add column if not exists group_limit integer,
  add column if not exists class_limit integer,
  add column if not exists team_member_limit integer,
  add column if not exists included_locations integer not null default 1,
  add column if not exists extra_location_month_price_cents integer,
  add column if not exists extra_location_year_price_cents integer;

alter table public.plans
  add constraint plans_group_limit_nonnegative check (group_limit is null or group_limit >= 0) not valid,
  add constraint plans_class_limit_nonnegative check (class_limit is null or class_limit >= 0) not valid,
  add constraint plans_team_member_limit_nonnegative check (team_member_limit is null or team_member_limit >= 0) not valid,
  add constraint plans_included_locations_positive check (included_locations > 0) not valid,
  add constraint plans_extra_location_prices_nonnegative check (
    (extra_location_month_price_cents is null or extra_location_month_price_cents >= 0) and
    (extra_location_year_price_cents is null or extra_location_year_price_cents >= 0)
  ) not valid;

alter table public.plans
  validate constraint plans_group_limit_nonnegative,
  validate constraint plans_class_limit_nonnegative,
  validate constraint plans_team_member_limit_nonnegative,
  validate constraint plans_included_locations_positive,
  validate constraint plans_extra_location_prices_nonnegative;

-- Preserve legacy price and Stripe identifiers. Existing subscribers keep their
-- current subscription and are entitled to Club features without repricing.
update public.plans
set is_archived = true
where code in ('pro', 'premium', 'network');

update public.plans
set athlete_limit = 30,
    group_limit = null,
    class_limit = null,
    team_member_limit = 2,
    academy_limit = 1,
    included_locations = 1,
    extra_location_month_price_cents = null,
    extra_location_year_price_cents = null,
    price_eur = 0,
    annual_price_eur = null,
    is_archived = false,
    nickname = 'Gratis'
where code = 'free';

insert into public.plans (
  code, athlete_limit, group_limit, class_limit, team_member_limit,
  academy_limit, included_locations, extra_location_month_price_cents,
  extra_location_year_price_cents, currency, billing_interval, nickname,
  is_archived, price_eur, annual_price_eur
)
select 'club', null, null, null, null, 1, 1, 2000, 20000, 'eur', null,
       'Club', false, 2900, 29000
where not exists (select 1 from public.plans where code = 'club');

update public.plans
set athlete_limit = null,
    group_limit = null,
    class_limit = null,
    team_member_limit = null,
    academy_limit = 1,
    included_locations = 1,
    extra_location_month_price_cents = 2000,
    extra_location_year_price_cents = 20000,
    price_eur = 2900,
    annual_price_eur = 29000,
    currency = 'eur',
    billing_interval = null,
    is_archived = false,
    nickname = 'Club'
where code = 'club';

alter table zaltyko.organization_saas_checkout_operations
  add column if not exists extra_location_quantity integer not null default 0;

alter table zaltyko.organization_saas_checkout_operations
  add constraint organization_saas_checkout_extra_location_quantity_nonnegative
  check (extra_location_quantity >= 0) not valid;

alter table zaltyko.organization_saas_checkout_operations
  validate constraint organization_saas_checkout_extra_location_quantity_nonnegative;

commit;
