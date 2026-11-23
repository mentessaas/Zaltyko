-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 2.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 32 elementos (vault).
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
  ('fig-wag-2025-2028', 'artistic_female', 2025, 2028, 'Código de Puntuación de Gimnasia Artística Femenina 2025-2028', 'https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20WAG%20COP%202025-2028.pdf', '2026-10-14'::date, 'published')
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
  ('vt_ro_bwd_tuck', 'vault', '4', null, 3.00, '4.10', 'Rondada y flik-flak con mortal atrás agrupado', 'Yurchenko', 'La gimnasta entra de espaldas a la mesa tras la rondada en el trampolín y apoya las manos con un flik-flak. Al despegar recoge las rodillas al pecho en un mortal atrás y cae mirando hacia la mesa.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_tuck_tw180', 'vault', '4', null, 3.20, '4.11', 'Rondada y flik-flak con mortal atrás agrupado y media pirueta (180°)', 'Yurchenko agrupado, media pirueta', 'Tras rondada y flik-flak a la mesa, la gimnasta empuja con los hombros y hace un mortal atrás agrupado al que suma media pirueta (180°). Cae de espaldas a la mesa, mirando en la dirección del salto.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_tuck_tw360', 'vault', '4', null, 3.60, '4.12', 'Rondada y flik-flak con mortal atrás agrupado y pirueta (360°)', 'Yurchenko agrupado, pirueta', 'Con la entrada de rondada y flik-flak, la gimnasta sale de la mesa en un mortal atrás con las rodillas recogidas y gira una pirueta completa (360°) mientras rota. Termina de cara a la mesa.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_tuck_tw540', 'vault', '4', null, 4.00, '4.13', 'Rondada y flik-flak con mortal atrás agrupado y pirueta y media (540°)', 'Yurchenko agrupado, pirueta y media', 'El segundo vuelo es un mortal atrás agrupado con pirueta y media (540°), tras llegar a la mesa con rondada y flik-flak. La caída queda de espaldas a la mesa.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_tuck_tw720', 'vault', '4', null, 4.40, '4.14', 'Rondada y flik-flak con mortal atrás agrupado y doble pirueta (720°)', 'Dungelova', 'La gimnasta llega con rondada y flik-flak y, en el vuelo de salida, mantiene la posición agrupada mientras completa doble pirueta (720°) dentro del mortal atrás. Aterriza mirando a la mesa.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_pike', 'vault', '4', null, 3.20, '4.20', 'Rondada y flik-flak con mortal atrás carpado', 'Yurchenko carpado', 'Después de apoyar las manos de espaldas a la mesa con el flik-flak, la gimnasta cierra el cuerpo por la cadera, con las piernas juntas y estiradas, en un mortal atrás carpado. Cae de frente a la mesa.', 66, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout', 'vault', '4', null, 3.60, '4.30', 'Rondada y flik-flak con mortal atrás extendido', 'Yurchenko extendido', 'Rondada al trampolín, flik-flak a la mesa y un mortal atrás con el cuerpo completamente estirado, sin flexionar cadera ni rodillas. La gimnasta aterriza mirando hacia la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout_tw180', 'vault', '4', null, 3.80, '4.31', 'Rondada y flik-flak con mortal atrás extendido y media pirueta (180°)', 'Yurchenko extendido, media pirueta', 'La gimnasta bloquea en la mesa tras el flik-flak y sale en mortal atrás extendido con media pirueta (180°), de modo que cae de espaldas a la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout_tw360', 'vault', '4', null, 4.20, '4.32', 'Rondada y flik-flak con mortal atrás extendido y pirueta (360°)', 'Yurchenko extendido, pirueta', 'En el segundo vuelo lleva el cuerpo estirado y gira una pirueta completa (360°) mientras da el mortal atrás. La entrada es rondada y flik-flak, y la gimnasta cae de cara a la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout_tw540', 'vault', '4', null, 4.60, '4.33', 'Rondada y flik-flak con mortal atrás extendido y pirueta y media (540°)', 'Yurchenko extendido, pirueta y media', 'Mortal atrás extendido con pirueta y media (540°) después de la entrada de rondada y flik-flak; la gimnasta cae de espaldas a la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout_tw720', 'vault', '4', null, 5.00, '4.34', 'Rondada y flik-flak con mortal atrás extendido y doble pirueta (720°)', 'Baitova', 'La gimnasta sale de la mesa con el cuerpo recto y encadena doble pirueta (720°) dentro de un mortal atrás, tras entrar con rondada y flik-flak. Cae mirando a la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_bwd_layout_tw900', 'vault', '4', null, 5.40, '4.35', 'Rondada y flik-flak con mortal atrás extendido y doble pirueta y media (900°)', 'Amanar', 'Tras la rondada y el flik-flak a la mesa, la gimnasta gira doble pirueta y media (900°) en un mortal atrás extendido. Llega al suelo de espaldas a la mesa, mirando en la dirección del salto.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_tuck', 'vault', '4', null, 3.60, '4.40', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás agrupado', 'Luconi', 'La gimnasta entra con rondada y flik-flak y, durante el primer vuelo, gira tres cuartos (270°) antes de poner las manos en la mesa. Al despegar hace un mortal atrás agrupado y cae mirando hacia la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_tuck_tw180', 'vault', '4', null, 4.00, '4.41', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás agrupado y media pirueta (180°)', 'Yurchenko 3/4, agrupado, media pirueta', 'Cae de espaldas a la mesa porque el mortal atrás agrupado de la salida lleva media pirueta (180°). Antes, la gimnasta ha entrado con rondada y flik-flak y ha girado tres cuartos (270°) en el aire antes de apoyar las manos.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_tuck_tw360', 'vault', '4', null, 4.20, '4.42', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás agrupado y pirueta (360°)', 'Yurchenko 3/4, agrupado, pirueta', 'En el primer vuelo, tras la rondada y el flik-flak, la gimnasta gira tres cuartos (270°) y apoya las manos en la mesa. Sale con un mortal atrás agrupado que incluye una pirueta completa (360°) y termina mirando hacia la mesa.', 67, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_pike', 'vault', '4', null, 3.80, '4.50', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás carpado', 'Yurchenko 3/4, carpado', 'Con el cuerpo carpado, piernas estiradas y cadera cerrada, la gimnasta hace un mortal atrás al salir de la mesa y cae de frente a ella. Llega desde rondada y flik-flak con tres cuartos de giro (270°) antes de apoyar las manos.', 68, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_layout', 'vault', '4', null, 4.20, '4.51', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás extendido', 'Yurchenko 3/4, extendido', 'La gimnasta llega a la mesa desde la rondada y el flik-flak girando tres cuartos (270°) en el aire, empuja con las manos y sale con un mortal atrás extendido, cuerpo recto de pies a cabeza, para caer mirando a la mesa.', 68, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_layout_tw180', 'vault', '4', null, 4.60, '4.52', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás extendido y media pirueta (180°)', 'Yurchenko 3/4, extendido, media pirueta', 'Tres cuartos de giro (270°) en el primer vuelo, tras rondada y flik-flak, dejan a la gimnasta apoyando las manos en la mesa. Después hace un mortal atrás extendido con media pirueta (180°) y aterriza de espaldas a la mesa.', 68, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro270_bwd_layout_tw360', 'vault', '4', null, 5.00, '4.53', 'Rondada, flik-flak con tres cuartos de giro (270°) y mortal atrás extendido y pirueta (360°)', 'Yurchenko 3/4, extendido, pirueta', 'La gimnasta termina mirando hacia la mesa tras un mortal atrás extendido con una pirueta completa (360°). Lo prepara con rondada, flik-flak y tres cuartos de giro (270°) en el vuelo, antes de que sus manos toquen la mesa.', 68, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro_double_bwd_pike', 'vault', '4', null, 6.40, '4.62', 'Rondada y flik-flak con doble mortal atrás carpado', 'Biles (doble mortal)', 'La gimnasta llega a la mesa con rondada y flik-flak y sale con altura suficiente para dar dos mortales atrás seguidos en posición carpada. Cae de cara a la mesa.', 68, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_tuck', 'vault', '5', null, 3.80, '5.10', 'Rondada, flik-flak con medio giro (180°) y mortal adelante agrupado', 'Ivantcheva', 'Durante el flik-flak la gimnasta da medio giro (180°), de modo que apoya las manos de frente a la mesa. Sale en un mortal adelante agrupado y cae de espaldas a la mesa.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_tuck_tw180', 'vault', '5', null, 4.00, '5.11', 'Rondada, flik-flak con medio giro (180°) y mortal adelante agrupado y media pirueta (180°)', 'Servente', 'La gimnasta da medio giro (180°) antes de apoyar en la mesa y sale en mortal adelante agrupado con media pirueta (180°), cayendo de cara a la mesa. También vale dar el medio giro al salir de la mesa y luego un mortal atrás agrupado.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_tuck_tw360', 'vault', '5', null, 4.40, '5.12', 'Rondada, flik-flak con medio giro (180°) y mortal adelante agrupado y pirueta (360°)', 'Yurchenko 1/2, agrupado, pirueta', 'Rondada y flik-flak con medio giro (180°) para llegar de frente a la mesa; después, mortal adelante con las rodillas recogidas y una pirueta (360°). Termina de espaldas a la mesa.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_tuck_tw540', 'vault', '5', null, 4.80, '5.13', 'Rondada, flik-flak con medio giro (180°) y mortal adelante agrupado y pirueta y media (540°)', 'Khorkina', 'Con medio giro (180°) en el primer vuelo, la gimnasta apoya de frente y sale en mortal adelante agrupado con pirueta y media (540°). Cae mirando hacia la mesa.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_pike', 'vault', '5', null, 4.00, '5.20', 'Rondada, flik-flak con medio giro (180°) y mortal adelante carpado', 'Omelianchik', 'La entrada combina rondada y flik-flak con medio giro (180°). El segundo vuelo es un mortal adelante carpado, con las piernas juntas y estiradas, y la caída queda de espaldas a la mesa.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_pike_tw180', 'vault', '5', null, 4.20, '5.21', 'Rondada, flik-flak con medio giro (180°) y mortal adelante carpado y media pirueta (180°)', 'Podkopayeva', 'Tras medio giro (180°) antes del apoyo, la gimnasta hace un mortal adelante carpado con media pirueta (180°) y cae de cara a la mesa. Se acepta igual si sale con medio giro y después un mortal atrás carpado.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_pike_tw360', 'vault', '5', null, 4.60, '5.22', 'Rondada, flik-flak con medio giro (180°) y mortal adelante carpado y pirueta (360°)', 'Yurchenko 1/2, carpado, pirueta', 'La gimnasta llega a la mesa con medio giro (180°) en el flik-flak y sale en un mortal adelante carpado con pirueta completa (360°). Aterriza de espaldas a la mesa.', 69, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_layout', 'vault', '5', null, 4.60, '5.30', 'Rondada, flik-flak con medio giro (180°) y mortal adelante extendido', 'Yurchenko 1/2, extendido', 'Medio giro (180°) durante el flik-flak, apoyo de frente a la mesa y mortal adelante con el cuerpo estirado. La gimnasta cae mirando en la dirección del salto, de espaldas a la mesa.', 70, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_layout_tw180', 'vault', '5', null, 4.80, '5.31', 'Rondada, flik-flak con medio giro (180°) y mortal adelante extendido y media pirueta (180°)', 'Yurchenko 1/2, extendido, media pirueta', 'En el segundo vuelo, con el cuerpo extendido, la gimnasta da un mortal adelante con media pirueta (180°); antes ha llegado a la mesa con un flik-flak con medio giro. Cae mirando a la mesa.', 70, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_layout_tw360', 'vault', '5', null, 5.20, '5.32', 'Rondada, flik-flak con medio giro (180°) y mortal adelante extendido y pirueta (360°)', 'Yurchenko 1/2, extendido, pirueta', 'Con el cuerpo extendido, la gimnasta sale de la mesa en un mortal adelante y completa una pirueta (360°) antes de caer de espaldas a ella. A la mesa llega desde la rondada y un flik-flak al que añade medio giro (180°).', 70, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_layout_tw540', 'vault', '5', null, 5.60, '5.33', 'Rondada, flik-flak con medio giro (180°) y mortal adelante extendido y pirueta y media (540°)', 'Cheng', 'La gimnasta da medio giro (180°) antes de apoyar las manos y, ya en el aire, hace un mortal adelante estirado con pirueta y media (540°). Termina de cara a la mesa.', 70, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date),
  ('vt_ro180_fwd_layout_tw720', 'vault', '5', null, 6.00, '5.34', 'Rondada, flik-flak con medio giro (180°) y mortal adelante extendido y doble pirueta (720°)', 'Biles (mortal adelante)', 'Tras la rondada y un flik-flak con medio giro (180°) a la mesa, la gimnasta sale en mortal adelante extendido y completa doble pirueta (720°). Cae de espaldas a la mesa.', 70, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 2, 'reviewed', '2026-11-23'::date);

do $element_catalog_seed_reviewed_guard$
declare
  changed_keys text;
begin
  select string_agg(e.element_key, ', ' order by e.element_key)
    into changed_keys
  from zaltyko.catalog_elements e
  join zaltyko.catalog_element_editions ed on ed.id = e.edition_id
  join pg_temp.element_catalog_seed_rows s on s.element_key = e.element_key
  where ed.code = 'fig-wag-2025-2028'
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
where ed.code = 'fig-wag-2025-2028'
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
