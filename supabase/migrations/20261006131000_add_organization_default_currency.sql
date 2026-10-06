begin;

alter table zaltyko.organizations
  add column default_currency text not null default 'EUR'
  check (default_currency ~ '^[A-Z]{3}$');

comment on column zaltyko.organizations.default_currency is
  'Moneda base explícita para nuevos cargos; los movimientos existentes conservan su propia moneda y nunca se convierten implícitamente.';

commit;
