-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 9.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 35 elementos (vault).
-- Semántica: crea o actualiza la edición por code sin bajar nunca una edición
-- retirada, y crea o actualiza los elementos de la tanda por (edition_id,
-- element_key). Nunca escribe withdrawn_at ni withdrawn_reason (una retirada
-- sobrevive a cualquier semilla), nunca devuelve un elemento revisado a
-- borrador y aborta sin cambiar nada si un elemento revisado cambiaría sin un
-- reviewed_on posterior al guardado. Repetirla con los mismos datos no cambia
-- ninguna fila. Requiere 20261119120000_element_library_candidate.sql.

begin;

do $element_catalog_seed_preflight$
begin
  if to_regclass('zaltyko.catalog_element_editions') is null
     or to_regclass('zaltyko.catalog_elements') is null then
    raise exception 'Element catalog seed requires zaltyko.catalog_element_editions and zaltyko.catalog_elements; apply 20261119120000_element_library_candidate.sql first';
  end if;
end;
$element_catalog_seed_preflight$;

insert into zaltyko.catalog_element_editions
  (code, discipline, cycle_start, cycle_end, title, document_url, cover_date, status)
values
  ('fig-mag-2025-2028', 'artistic_male', 2025, 2028, 'Código de Puntuación de Gimnasia Artística Masculina 2025-2028', 'https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20MAG%20Code%20of%20Points%202025-2028.pdf', '2026-11-16'::date, 'published')
on conflict (code) do update set
  discipline = excluded.discipline,
  cycle_start = excluded.cycle_start,
  cycle_end = excluded.cycle_end,
  title = excluded.title,
  document_url = excluded.document_url,
  cover_date = excluded.cover_date,
  status = case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end,
  updated_at = now()
where (catalog_element_editions.discipline, catalog_element_editions.cycle_start,
       catalog_element_editions.cycle_end, catalog_element_editions.title,
       catalog_element_editions.document_url, catalog_element_editions.cover_date,
       catalog_element_editions.status)
  is distinct from (excluded.discipline, excluded.cycle_start, excluded.cycle_end,
       excluded.title, excluded.document_url, excluded.cover_date,
       case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end);

create temporary table element_catalog_seed_rows (
  element_key text primary key,
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
  review_status text not null,
  reviewed_on date
) on commit drop;

insert into pg_temp.element_catalog_seed_rows
  (element_key, apparatus, element_group, value_letter, value_points, fig_reference, name, short_name, description, source_page, source_checked_on, drafted_by, drafted_on, batch, review_status, reviewed_on)
values
  ('mvt_yurchenko_tucked_twist_360', 'vault', 'IV', null, 2.40, '401', 'Yurchenko agrupado con una pirueta (360°)', 'Yurchenko agrupado con pirueta', 'Una pirueta (360°) en un Yurchenko agrupado: rondada, flic-flac a la mesa y mortal atrás agrupado en el segundo vuelo.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_tucked_twist_540', 'vault', 'IV', null, 2.80, '402', 'Yurchenko agrupado con pirueta y media (540°)', 'Yurchenko agrupado con pirueta y media', 'Tras la rondada y el flic-flac a la mesa, el mortal atrás agrupado del Yurchenko lleva pirueta y media (540°).', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_tucked_twist_720', 'vault', 'IV', null, 3.20, '403', 'Yurchenko agrupado con doble pirueta (720°)', 'Yurchenko agrupado con doble pirueta', 'Doble pirueta (720°) sobre la forma Yurchenko, con el mortal atrás agrupado.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_tucked_twist_900', 'vault', 'IV', null, 3.60, '404', 'Yurchenko agrupado con dos piruetas y media (900°)', 'Yurchenko agrupado, dos piruetas y media', 'Con el cuerpo agrupado, este Yurchenko gira dos piruetas y media (900°) en el mortal atrás.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_360', 'vault', 'IV', null, 3.60, '405', 'Yurchenko extendido con una pirueta (360°)', 'Yurchenko extendido con pirueta', 'Rondada y flic-flac a la mesa y, en el segundo vuelo, mortal atrás extendido con una pirueta (360°).', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_540', 'vault', 'IV', null, 4.00, '406', 'Yurchenko extendido con pirueta y media (540°)', 'Yurchenko extendido con pirueta y media', 'Pirueta y media (540°) en un Yurchenko extendido.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_720', 'vault', 'IV', null, 4.40, '407', 'Yurchenko extendido con doble pirueta (720°)', 'Yurchenko extendido con doble pirueta', 'El mortal atrás extendido de la forma Yurchenko lleva aquí doble pirueta (720°).', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_900', 'vault', 'IV', null, 4.80, '408', 'Yurchenko extendido con dos piruetas y media (900°)', 'Shewfelt', 'El Shewfelt es un Yurchenko extendido con dos piruetas y media (900°).', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_1080', 'vault', 'IV', null, 5.20, '409', 'Yurchenko extendido con triple pirueta (1080°)', 'Shirai / Kim Hee Hoon', 'Triple pirueta (1080°) en un Yurchenko extendido: es el salto que lleva el nombre de Shirai y de Kim Hee Hoon.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_1260', 'vault', 'IV', null, 5.60, '410', 'Yurchenko extendido con tres piruetas y media (1260°)', 'Shirai 2', 'Tres piruetas y media (1260°) sobre un Yurchenko extendido: es el Shirai 2.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_tucked_twist_180', 'vault', 'IV', null, 2.60, '413', 'Rondada con medio giro (180°), paloma y mortal adelante agrupado con media pirueta (180°)', 'Rondada ½ giro agrupado, media pirueta', 'Media pirueta (180°) en un mortal adelante agrupado. Entra en rondada, da medio giro (180°) antes de llegar a la mesa y apoya como en una paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_piked_twist_180', 'vault', 'IV', null, 3.00, '414', 'Rondada con medio giro (180°), paloma y mortal adelante carpado con media pirueta (180°)', 'Nemov', 'El Nemov sale en mortal adelante carpado con media pirueta (180°), tras una rondada con medio giro (180°) antes de la mesa y apoyo de paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched_twist_180', 'vault', 'IV', null, 3.80, '415', 'Rondada con medio giro (180°), paloma y mortal adelante extendido con media pirueta (180°)', 'Hutcheon', 'Rondada con medio giro (180°) antes de la mesa, apoyo de paloma y mortal adelante extendido con media pirueta (180°): es el Hutcheon.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched_twist_360', 'vault', 'IV', null, 4.20, '416', 'Rondada con medio giro (180°), paloma y mortal adelante extendido con una pirueta (360°)', 'Rondada ½ giro extendido con pirueta', 'Con el cuerpo extendido, el mortal adelante lleva una pirueta (360°). La entrada es una rondada con medio giro (180°) antes de llegar a la mesa y apoyo de paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched_twist_540', 'vault', 'IV', null, 4.60, '417', 'Rondada con medio giro (180°), paloma y mortal adelante extendido con pirueta y media (540°)', 'Rondada ½ giro extendido, pirueta y ½', 'Pirueta y media (540°) en un mortal adelante extendido, después de una rondada con medio giro (180°) antes de la mesa y apoyo de paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched_twist_720', 'vault', 'IV', null, 5.00, '419', 'Rondada con medio giro (180°), paloma y mortal adelante extendido con doble pirueta (720°)', 'Rondada ½ giro extendido, doble pirueta', 'Doble pirueta (720°) en el mortal adelante extendido. Antes, rondada, medio giro (180°) hacia la mesa y apoyo de paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched_twist_900', 'vault', 'IV', null, 5.40, '420', 'Rondada con medio giro (180°), paloma y mortal adelante extendido con dos piruetas y media (900°)', 'Li Xiao Peng', 'El Li Xiao Peng gira dos piruetas y media (900°) en un mortal adelante extendido; entra con rondada, medio giro (180°) antes de la mesa y apoyo de paloma.', 91, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_handspring_bwd', 'vault', 'V', null, 1.20, '501', 'Rondada y flic-flac a la mesa, sin mortal', 'Rondada flic-flac', 'Rondada y flic-flac a la mesa, sin mortal ni pirueta.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_handspring_bwd_twist_180', 'vault', 'V', null, 1.40, '502', 'Rondada y flic-flac a la mesa con media pirueta (180°), sin mortal', 'Rondada flic-flac con media pirueta', 'Media pirueta (180°) sin mortal, tras rondada y flic-flac a la mesa.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_handspring_bwd_twist_360', 'vault', 'V', null, 1.60, '503', 'Rondada y flic-flac a la mesa con una pirueta (360°), sin mortal', 'Rondada flic-flac con pirueta', 'Entra con rondada y flic-flac a la mesa y hace una pirueta (360°), sin mortal.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_tucked', 'vault', 'V', null, 1.80, '507', 'Rondada, flic-flac a la mesa y mortal atrás agrupado', 'Yurchenko', 'El Yurchenko: rondada, flic-flac a la mesa y mortal atrás agrupado en el segundo vuelo.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_tucked_twist_180', 'vault', 'V', null, 2.00, '508', 'Yurchenko agrupado con media pirueta (180°)', 'Yurchenko agrupado con media pirueta', 'Media pirueta (180°) en un Yurchenko agrupado.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_piked', 'vault', 'V', null, 2.00, '509', 'Yurchenko carpado', 'Yurchenko carpado', 'Yurchenko con el mortal atrás carpado, sin pirueta.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched', 'vault', 'V', null, 2.80, '510', 'Yurchenko extendido', 'Yurchenko extendido', 'Forma Yurchenko con el cuerpo extendido y sin pirueta.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_stretched_twist_180', 'vault', 'V', null, 3.20, '511', 'Yurchenko extendido con media pirueta (180°)', 'Yurchenko extendido con media pirueta', 'Yurchenko extendido que añade media pirueta (180°).', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_handspring_fwd', 'vault', 'V', null, 1.40, '513', 'Rondada con medio giro (180°) y paloma, sin mortal', 'Rondada ½ giro y paloma', 'Rondada con medio giro (180°) antes de llegar a la mesa y paloma, sin mortal.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_handspring_fwd_twist_180', 'vault', 'V', null, 1.60, '514', 'Rondada con medio giro (180°) y paloma con media pirueta (180°), sin mortal', 'Rondada ½ giro y paloma, media pirueta', 'Sin mortal: rondada, medio giro (180°) antes de la mesa, paloma y media pirueta (180°).', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_handspring_fwd_twist_360', 'vault', 'V', null, 1.80, '515', 'Rondada con medio giro (180°) y paloma con una pirueta (360°), sin mortal', 'Rondada ½ giro y paloma con pirueta', 'Tras la rondada con medio giro (180°) antes de la mesa, el gimnasta apoya en paloma y hace una pirueta (360°), sin mortal.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_tucked', 'vault', 'V', null, 2.20, '516', 'Rondada con medio giro (180°), paloma y mortal adelante agrupado', 'Rondada ½ giro, mortal agrupado', 'Mortal adelante agrupado tras una rondada con medio giro (180°) antes de la mesa y apoyo de paloma.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_piked', 'vault', 'V', null, 2.60, '517', 'Rondada con medio giro (180°), paloma y mortal adelante carpado', 'Rondada ½ giro, mortal carpado', 'Con el mortal adelante carpado: rondada, medio giro (180°) antes de llegar a la mesa y apoyo de paloma.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_salto_fwd_stretched', 'vault', 'V', null, 3.40, '518', 'Rondada con medio giro (180°), paloma y mortal adelante extendido', 'Rondada ½ giro, mortal extendido', 'Rondada, medio giro (180°) antes de la mesa y apoyo de paloma; en el segundo vuelo, mortal adelante extendido.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_double_salto_bwd_tucked', 'vault', 'V', null, 4.80, '519', 'Doble mortal atrás agrupado con entrada Yurchenko', 'Melissanidis', 'Tras la entrada Yurchenko, el Melissanidis hace dos mortales atrás agrupados en el segundo vuelo.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_melissanidis_piked', 'vault', 'V', null, 5.20, '520', 'Doble mortal atrás carpado con entrada Yurchenko', 'Yang Wei', 'Es un Melissanidis carpado: después de la entrada Yurchenko, dos mortales atrás carpados en el segundo vuelo.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_round_off_half_turn_hdspr_double_salto_fwd_tucked', 'vault', 'V', null, 5.00, '521', 'Rondada con medio giro (180°), paloma y doble mortal adelante agrupado', 'Rondada ½ giro, doble mortal agrupado', 'Doble mortal adelante agrupado en el segundo vuelo, después de una rondada con medio giro (180°) antes de la mesa y apoyo de paloma.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date),
  ('mvt_yurchenko_double_salto_bwd_tucked_twist_360', 'vault', 'V', null, 5.60, '522', 'Doble mortal atrás agrupado con entrada Yurchenko y una pirueta (360°)', 'Olfati', 'El Olfati añade una pirueta (360°) a los dos mortales atrás agrupados que siguen a la entrada Yurchenko.', 92, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 9, 'reviewed', '2026-11-23'::date);

do $element_catalog_seed_reviewed_guard$
declare
  changed_keys text;
begin
  select string_agg(e.element_key, ', ' order by e.element_key)
    into changed_keys
  from zaltyko.catalog_elements e
  join zaltyko.catalog_element_editions ed on ed.id = e.edition_id
  join pg_temp.element_catalog_seed_rows s on s.element_key = e.element_key
  where ed.code = 'fig-mag-2025-2028'
    and e.review_status = 'reviewed'
    and (e.apparatus, e.element_group, e.value_letter, e.value_points, e.fig_reference, e.name, e.short_name, e.description)
        is distinct from (s.apparatus, s.element_group, s.value_letter, s.value_points, s.fig_reference, s.name, s.short_name, s.description)
    and (s.reviewed_on is null or e.reviewed_on is null or s.reviewed_on <= e.reviewed_on);
  if changed_keys is not null then
    raise exception 'Element catalog seed would change reviewed elements without a newer reviewed_on: %', changed_keys;
  end if;
end;
$element_catalog_seed_reviewed_guard$;

insert into zaltyko.catalog_elements
  (edition_id, element_key, discipline, apparatus, element_group, value_letter, value_points, fig_reference, name, short_name, description, source_page, source_checked_on, drafted_by, drafted_on, batch, review_status, reviewed_on)
select ed.id, s.element_key, ed.discipline, s.apparatus, s.element_group, s.value_letter, s.value_points, s.fig_reference, s.name, s.short_name, s.description, s.source_page, s.source_checked_on, s.drafted_by, s.drafted_on, s.batch, s.review_status, s.reviewed_on
from pg_temp.element_catalog_seed_rows s
cross join zaltyko.catalog_element_editions ed
where ed.code = 'fig-mag-2025-2028'
on conflict (edition_id, element_key) do update set
  discipline = excluded.discipline,
  apparatus = excluded.apparatus,
  element_group = excluded.element_group,
  value_letter = excluded.value_letter,
  value_points = excluded.value_points,
  fig_reference = excluded.fig_reference,
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  source_page = excluded.source_page,
  source_checked_on = excluded.source_checked_on,
  drafted_by = excluded.drafted_by,
  drafted_on = excluded.drafted_on,
  batch = excluded.batch,
  review_status = case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end,
  reviewed_on = case when catalog_elements.review_status = 'reviewed' then greatest(catalog_elements.reviewed_on, excluded.reviewed_on) else excluded.reviewed_on end,
  updated_at = now()
where (catalog_elements.discipline, catalog_elements.apparatus, catalog_elements.element_group, catalog_elements.value_letter, catalog_elements.value_points, catalog_elements.fig_reference, catalog_elements.name, catalog_elements.short_name, catalog_elements.description, catalog_elements.source_page, catalog_elements.source_checked_on, catalog_elements.drafted_by, catalog_elements.drafted_on, catalog_elements.batch, catalog_elements.review_status, catalog_elements.reviewed_on)
  is distinct from (excluded.discipline, excluded.apparatus, excluded.element_group, excluded.value_letter, excluded.value_points, excluded.fig_reference, excluded.name, excluded.short_name, excluded.description, excluded.source_page, excluded.source_checked_on, excluded.drafted_by, excluded.drafted_on, excluded.batch, case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end, case when catalog_elements.review_status = 'reviewed' then greatest(catalog_elements.reviewed_on, excluded.reviewed_on) else excluded.reviewed_on end);

commit;
