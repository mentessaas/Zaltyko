-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox, staging o producción). No aplicado en ningún entorno.
-- Biblioteca de elementos, fase C
-- (docs/architecture/adr/0029-biblioteca-de-elementos-y-niveles.md, §1, §3 y §8).
--
-- - zaltyko.catalog_element_editions y zaltyko.catalog_elements: catálogo
--   global de elementos FIG, sin organization_id. Solo hechos (aparato, grupo,
--   valor, página) y nombres y descripciones redactados por Zaltyko. Sin
--   imágenes, vídeos ni URL de terceros: la única URL es la del documento
--   oficial de la edición. Solo escriben las semillas por tanda
--   (<ts>_element_catalog_seed_<edición>_<tanda>.sql) y la acción «Retirar».
-- - zaltyko.content_notices: registro interno de avisos sobre contenido
--   (Reglamento de Servicios Digitales, art. 16). Guarda nombre y correo de
--   quien avisa: se borran (sender_erased_at) dos años después del cierre.
-- - zaltyko.content_withdrawals: plantillas de federación retiradas, que el
--   código lee para ocultarlas sin redesplegar.
-- - skill_elements.catalog_element_id y session_plan_blocks.catalog_element_id:
--   enlace opcional a un elemento del catálogo. Columnas nulas, sin valor por
--   defecto y sin relleno: las filas existentes no cambian.
--
-- Requiere antes las candidatas de niveles
-- (20261114121000_skill_levels_candidate.sql) y de guiones
-- (20261111200000_session_plans_candidate.sql), con la forma exacta que
-- instalan. La nota de cada academia va en otra candidata
-- (20261119120500_element_library_notes_candidate.sql), que requiere esta.
--
-- Solo service_role: RLS ENABLE y FORCE y REVOKE a public, anon y
-- authenticated, sin grants ni políticas. Todas las restricciones llevan nombre
-- (< 63 caracteres) y el espejo Drizzle
-- (src/modules/element-library/infrastructure/element-library-schema.ts) las
-- repite: lo comprueba tests/element-library-contract.test.ts.
-- El archivo abre y cierra su propia transacción, con lock_timeout: si no
-- obtiene el bloqueo, no cambia nada. Reinstalar aborta antes de tocar nada:
-- una instalación parcial o divergente exige reconciliación humana, nunca
-- reparación. La vuelta atrás va comentada al final y no se ejecuta con este
-- archivo.
begin;

set local lock_timeout = '5s';

do $element_library_candidate_preflight$
begin
  if to_regclass('zaltyko.catalog_element_editions') is not null
     or to_regclass('zaltyko.catalog_elements') is not null
     or to_regclass('zaltyko.content_notices') is not null
     or to_regclass('zaltyko.content_withdrawals') is not null
     or exists (
       select 1
         from pg_attribute
        where attrelid in (to_regclass('zaltyko.skill_elements'), to_regclass('zaltyko.session_plan_blocks'))
          and attname = 'catalog_element_id'
          and attnum > 0
          and not attisdropped
     ) then
    raise exception 'Element library candidate requires zaltyko.catalog_element_editions, zaltyko.catalog_elements, zaltyko.content_notices, zaltyko.content_withdrawals, skill_elements.catalog_element_id and session_plan_blocks.catalog_element_id absent; inspect existing schema before promotion';
  end if;
  -- Niveles y guiones tal cual los instalan sus candidatas: ni una columna más
  -- ni una menos, con su tipo y su nulabilidad.
  if to_regclass('zaltyko.skill_elements') is null
     or to_regclass('zaltyko.session_plan_blocks') is null
     or coalesce((
       select array_agg(column_name::text || '|' || data_type::text || '|' || is_nullable::text order by column_name::text collate "C")
         from information_schema.columns
        where table_schema = 'zaltyko'
          and table_name = 'skill_elements'
     ) <> array[
       'apparatus|text|YES',
       'archived_at|timestamp with time zone|YES',
       'created_at|timestamp with time zone|NO',
       'description|text|YES',
       'id|uuid|NO',
       'is_required|boolean|NO',
       'level_id|uuid|NO',
       'name|text|NO',
       'organization_id|uuid|NO',
       'position|integer|NO',
       'template_id|uuid|NO',
       'updated_at|timestamp with time zone|NO'
     ]::text[], true)
     or coalesce((
       select array_agg(column_name::text || '|' || data_type::text || '|' || is_nullable::text order by column_name::text collate "C")
         from information_schema.columns
        where table_schema = 'zaltyko'
          and table_name = 'session_plan_blocks'
     ) <> array[
       'apparatus|text|YES',
       'content|text|NO',
       'created_at|timestamp with time zone|NO',
       'discipline|text|YES',
       'done_at|timestamp with time zone|YES',
       'done_by_member_id|uuid|YES',
       'duration_minutes|integer|YES',
       'id|uuid|NO',
       'kind|text|NO',
       'organization_id|uuid|NO',
       'plan_id|uuid|NO',
       'position|integer|NO'
     ]::text[], true) then
    raise exception 'Element library candidate requires the skill levels (20261114121000) and session plans (20261111200000) candidates installed first, with their exact shape';
  end if;
end;
$element_library_candidate_preflight$;

-- Edición del Código de una disciplina y un ciclo. La semilla la crea o la
-- actualiza por code y nunca baja una edición retirada. document_url es el
-- documento oficial (solo HTTPS); la fecha de portada se comprueba en el PDF.
create table zaltyko.catalog_element_editions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discipline text not null,
  cycle_start integer not null,
  cycle_end integer not null,
  title text not null,
  document_url text not null,
  cover_date date not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_element_editions_code_uq unique (code),
  constraint catalog_element_editions_code_check
    check (code in ('fig-wag-2025-2028', 'fig-mag-2025-2028')),
  constraint catalog_element_editions_discipline_check
    check (discipline in ('artistic_female', 'artistic_male')),
  constraint catalog_element_editions_code_discipline_check
    check ((code = 'fig-wag-2025-2028' and discipline = 'artistic_female') or (code = 'fig-mag-2025-2028' and discipline = 'artistic_male')),
  constraint catalog_element_editions_cycle_check
    check (cycle_end > cycle_start),
  constraint catalog_element_editions_title_check
    check (length(btrim(title)) >= 1 and length(title) <= 200 and title !~ '[[:cntrl:]]'),
  constraint catalog_element_editions_document_url_check
    check (length(document_url) <= 500 and document_url ~ '^https://' and document_url !~ '[[:space:][:cntrl:]]'),
  constraint catalog_element_editions_status_check
    check (status in ('draft', 'published', 'retired'))
);

-- Un elemento de una edición. element_key es clave propia, estable entre
-- ediciones; fig_reference solo es referencia (no es clave ni ordena). Lleva
-- letra de valor o puntos (solo salto), exactamente uno. «Revisado» exige la
-- fecha de revisión; la retirada (withdrawn_at con su motivo) no la deshace
-- ninguna semilla. on delete restrict: un elemento ni una edición se borran
-- mientras algo los use; se retiran.
create table zaltyko.catalog_elements (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references zaltyko.catalog_element_editions(id) on delete restrict,
  element_key text not null,
  discipline text not null,
  apparatus text not null,
  element_group text not null,
  value_letter text,
  value_points numeric(4,2),
  fig_reference text,
  name text not null,
  short_name text not null,
  description text,
  source_page integer not null,
  source_checked_on date not null,
  drafted_by text not null,
  drafted_on date not null,
  batch integer not null,
  review_status text not null default 'draft',
  reviewed_on date,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_elements_edition_key_uq unique (edition_id, element_key),
  constraint catalog_elements_key_check
    check (element_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint catalog_elements_discipline_check
    check (discipline in ('artistic_female', 'artistic_male')),
  constraint catalog_elements_apparatus_check
    check ((discipline = 'artistic_female' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor')) or (discipline = 'artistic_male' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar'))),
  constraint catalog_elements_group_check
    check (element_group ~ '^[A-Za-z0-9_-]{1,20}$'),
  constraint catalog_elements_value_letter_check
    check (value_letter is null or value_letter ~ '^[A-J]$'),
  constraint catalog_elements_value_points_check
    check (value_points is null or value_points > 0),
  constraint catalog_elements_value_one_check
    check ((value_letter is null) <> (value_points is null)),
  constraint catalog_elements_value_points_vault_check
    check (value_points is null or apparatus = 'vault'),
  constraint catalog_elements_fig_reference_check
    check (fig_reference is null or (length(btrim(fig_reference)) >= 1 and length(fig_reference) <= 20 and fig_reference !~ '[[:cntrl:]]')),
  constraint catalog_elements_name_check
    check (length(btrim(name)) >= 2 and length(name) <= 100 and name !~ '[[:cntrl:]]'),
  constraint catalog_elements_short_name_check
    check (length(btrim(short_name)) >= 1 and length(short_name) <= 40 and short_name !~ '[[:cntrl:]]'),
  constraint catalog_elements_description_check
    check (description is null or (length(btrim(description)) >= 1 and length(description) <= 300 and description !~ '[[:cntrl:]]')),
  constraint catalog_elements_source_page_check
    check (source_page > 0),
  constraint catalog_elements_drafted_by_check
    check (length(btrim(drafted_by)) between 1 and 40 and drafted_by !~ '[[:cntrl:]]'),
  constraint catalog_elements_batch_check
    check (batch > 0),
  constraint catalog_elements_review_status_check
    check (review_status in ('draft', 'reviewed')),
  constraint catalog_elements_reviewed_on_check
    check ((review_status = 'reviewed') = (reviewed_on is not null)),
  constraint catalog_elements_withdrawn_check
    check ((withdrawn_at is null) = (withdrawn_reason is null)),
  constraint catalog_elements_withdrawn_reason_check
    check (withdrawn_reason is null or (length(btrim(withdrawn_reason)) >= 1 and length(withdrawn_reason) <= 500))
);

create index catalog_elements_browse_idx
  on zaltyko.catalog_elements(edition_id, apparatus, element_group);

-- Aviso recibido por el formulario público. Nombre y correo son obligatorios
-- al recibirlo y se borran a la vez (sender_erased_at) dos años después del
-- cierre. submission_hash (SHA-256 en hexadecimal del cuerpo normalizado) hace
-- que reenviar el mismo aviso no cree otra fila. Un aviso no retira nada por sí
-- solo. reason y response admiten saltos de línea.
create table zaltyko.content_notices (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  sender_name text,
  sender_email text,
  content_url text not null,
  content_kind text not null,
  content_key text,
  reason text not null,
  good_faith_confirmed boolean not null,
  status text not null default 'received',
  response text,
  closed_at timestamptz,
  sender_erased_at timestamptz,
  submission_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_notices_submission_hash_uq unique (submission_hash),
  constraint content_notices_sender_name_check
    check (sender_name is null or (length(btrim(sender_name)) >= 1 and length(sender_name) <= 120 and sender_name !~ '[[:cntrl:]]')),
  constraint content_notices_sender_email_check
    check (sender_email is null or (length(sender_email) <= 254 and sender_email ~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+$')),
  constraint content_notices_sender_check
    check ((sender_erased_at is null and sender_name is not null and sender_email is not null) or (sender_erased_at is not null and sender_name is null and sender_email is null)),
  constraint content_notices_content_url_check
    check (length(btrim(content_url)) >= 1 and length(content_url) <= 500 and content_url !~ '[[:space:][:cntrl:]]'),
  constraint content_notices_content_kind_check
    check (content_kind in ('element', 'federation_template', 'other')),
  constraint content_notices_content_key_check
    check (content_key is null or (length(content_key) between 1 and 64 and content_key !~ '[[:space:][:cntrl:]]')),
  constraint content_notices_reason_check
    check (length(btrim(reason)) >= 10 and length(reason) <= 2000),
  constraint content_notices_good_faith_check
    check (good_faith_confirmed = true),
  constraint content_notices_status_check
    check (status in ('received', 'reviewing', 'closed')),
  constraint content_notices_response_check
    check (response is null or (length(btrim(response)) >= 1 and length(response) <= 2000)),
  constraint content_notices_closed_check
    check ((status = 'closed') = (closed_at is not null)),
  constraint content_notices_submission_hash_check
    check (submission_hash ~ '^[0-9a-f]{64}$')
);

create index content_notices_status_idx
  on zaltyko.content_notices(status, closed_at);

-- Plantilla de federación retirada: una fila por clase y clave. Mientras esté
-- aquí, la importación desaparece y las copias muestran «Fuente retirada».
-- Borrar el aviso deja la retirada sin referencia (set null).
create table zaltyko.content_withdrawals (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  key text not null,
  withdrawn_at timestamptz not null default now(),
  reason text not null,
  notice_id uuid references zaltyko.content_notices(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_withdrawals_kind_key_uq unique (kind, key),
  constraint content_withdrawals_kind_check
    check (kind in ('federation_template')),
  constraint content_withdrawals_key_check
    check (length(key) between 1 and 64 and key !~ '[[:space:][:cntrl:]]'),
  constraint content_withdrawals_reason_check
    check (length(btrim(reason)) >= 1 and length(reason) <= 500)
);

create index content_withdrawals_notice_idx
  on zaltyko.content_withdrawals(notice_id);

-- Enlace opcional desde niveles y guiones. Nulo, sin valor por defecto y sin
-- relleno: ninguna fila existente cambia. on delete restrict: un elemento
-- enlazado no se borra (se retira). El aparato y la disciplina los comprueba
-- el servidor.
alter table zaltyko.skill_elements add column catalog_element_id uuid references zaltyko.catalog_elements(id) on delete restrict;
alter table zaltyko.session_plan_blocks add column catalog_element_id uuid references zaltyko.catalog_elements(id) on delete restrict;

create index skill_elements_catalog_element_idx
  on zaltyko.skill_elements(catalog_element_id)
  where catalog_element_id is not null;
create index session_plan_blocks_catalog_element_idx
  on zaltyko.session_plan_blocks(catalog_element_id)
  where catalog_element_id is not null;

alter table zaltyko.catalog_element_editions enable row level security;
alter table zaltyko.catalog_element_editions force row level security;
alter table zaltyko.catalog_elements enable row level security;
alter table zaltyko.catalog_elements force row level security;
alter table zaltyko.content_notices enable row level security;
alter table zaltyko.content_notices force row level security;
alter table zaltyko.content_withdrawals enable row level security;
alter table zaltyko.content_withdrawals force row level security;
revoke all on table zaltyko.catalog_element_editions from public, anon, authenticated;
revoke all on table zaltyko.catalog_elements from public, anon, authenticated;
revoke all on table zaltyko.content_notices from public, anon, authenticated;
revoke all on table zaltyko.content_withdrawals from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor. El catálogo es global (shared_catalogs); los avisos son datos
-- internos con datos personales de terceros, fuera del paquete de la academia.

commit;

-- VUELTA ATRÁS. Comentada: no se ejecuta con este archivo y requiere la misma
-- autorización de Elvis. Antes: apagar ZALTYKO_ELEMENT_LIBRARY_ENABLED y
-- retirar la candidata de notas (20261119120500), que apunta a
-- catalog_elements. Quita los enlaces de niveles y guiones (las filas se
-- conservan sin enlace) y borra catálogo, avisos y retiradas: exportar antes
-- los avisos si hay que conservarlos. Deja niveles y guiones exactamente como
-- los instalaron sus candidatas (tests/element-library-pg.test.ts lo comprueba
-- ejecutando este bloque).
-- >>> vuelta atrás
-- begin;
-- set local lock_timeout = '5s';
-- alter table zaltyko.session_plan_blocks drop column catalog_element_id;
-- alter table zaltyko.skill_elements drop column catalog_element_id;
-- drop table zaltyko.content_withdrawals;
-- drop table zaltyko.content_notices;
-- drop table zaltyko.catalog_elements;
-- drop table zaltyko.catalog_element_editions;
-- commit;
-- <<< vuelta atrás
