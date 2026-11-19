-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox, staging o producción). No aplicado en ningún entorno.
-- Biblioteca de elementos, fase C: la nota de cada academia sobre un elemento
-- del catálogo (docs/architecture/adr/0029-biblioteca-de-elementos-y-niveles.md,
-- §2). La escriben la dirección y las entrenadoras y la lee todo el equipo; las
-- familias no la ven. Sin columnas de vídeo, imagen ni enlaces.
--
-- - zaltyko.academy_element_notes: una fila por academia y elemento, con el
--   texto de la nota (hasta 500 caracteres), su revisión, la autoría y las
--   fechas. Borrar la academia borra sus notas; dar de baja a una integrante
--   deja la autoría en blanco (on delete set null de su columna, PostgreSQL
--   15 o posterior). Un elemento con notas no se borra (se retira).
--
-- Requiere antes 20261119120000_element_library_candidate.sql. Datos de la
-- academia (módulo element_library de la exportación). Solo service_role: RLS
-- ENABLE y FORCE y REVOKE a public, anon y authenticated, sin grants ni
-- políticas. El archivo abre y cierra su propia transacción, con
-- lock_timeout. Reinstalar aborta antes de tocar nada. La vuelta atrás va
-- comentada al final y no se ejecuta con este archivo.
begin;

set local lock_timeout = '5s';

do $element_library_notes_candidate_preflight$
begin
  -- on delete set null (columna) necesita PostgreSQL 15 o posterior.
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Element library notes candidate requires PostgreSQL 15 or later';
  end if;
  if to_regclass('zaltyko.organizations') is null
     or to_regclass('zaltyko.organization_members') is null
     or to_regclass('zaltyko.catalog_element_editions') is null
     or to_regclass('zaltyko.catalog_elements') is null
     or to_regclass('zaltyko.content_notices') is null
     or to_regclass('zaltyko.content_withdrawals') is null then
    raise exception 'Element library notes candidate requires the element library candidate (20261119120000) installed first';
  end if;
  if to_regclass('zaltyko.academy_element_notes') is not null then
    raise exception 'Element library notes candidate requires zaltyko.academy_element_notes absent; inspect existing schema before promotion';
  end if;
end;
$element_library_notes_candidate_preflight$;

create table zaltyko.academy_element_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  catalog_element_id uuid not null references zaltyko.catalog_elements(id) on delete restrict,
  note text not null,
  revision integer not null default 1,
  created_by_member_id uuid,
  updated_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_element_notes_org_id_uq unique (organization_id, id),
  constraint academy_element_notes_element_uq unique (organization_id, catalog_element_id),
  constraint academy_element_notes_note_check
    check (length(btrim(note)) >= 1 and length(note) <= 500),
  constraint academy_element_notes_revision_check
    check (revision > 0),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (created_by_member_id),
  foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (updated_by_member_id)
);

-- Borrar o retirar un elemento busca sus notas; dar de baja a una integrante,
-- las que escribió.
create index academy_element_notes_element_idx
  on zaltyko.academy_element_notes(catalog_element_id);
create index academy_element_notes_created_by_idx
  on zaltyko.academy_element_notes(organization_id, created_by_member_id);
create index academy_element_notes_updated_by_idx
  on zaltyko.academy_element_notes(organization_id, updated_by_member_id);

alter table zaltyko.academy_element_notes enable row level security;
alter table zaltyko.academy_element_notes force row level security;
revoke all on table zaltyko.academy_element_notes from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor. Los datos son de la academia (responsable); Zaltyko los trata
-- por su cuenta.

commit;

-- VUELTA ATRÁS. Comentada: no se ejecuta con este archivo y requiere la misma
-- autorización de Elvis. Antes: apagar ZALTYKO_ELEMENT_LIBRARY_ENABLED. Borra
-- las notas de todas las academias: exportarlas antes si importan. Va antes
-- que la vuelta atrás de 20261119120000_element_library_candidate.sql.
-- >>> vuelta atrás
-- begin;
-- set local lock_timeout = '5s';
-- drop table zaltyko.academy_element_notes;
-- commit;
-- <<< vuelta atrás
