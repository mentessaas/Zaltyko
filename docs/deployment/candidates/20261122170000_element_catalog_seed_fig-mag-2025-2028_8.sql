-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 8.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 48 elementos (vault).
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
  ('mvt_handspring_salto_fwd_tucked_twist_180', 'vault', 'I', null, 2.40, '101', 'Paloma y mortal adelante agrupado con media pirueta (180°)', 'Paloma mortal agrupado, media pirueta', 'Lleva media pirueta (180°) dentro de un mortal adelante agrupado, tras entrar con paloma de frente. Cuenta igual el Cuervo agrupado sin pirueta añadida: paloma, medio giro y mortal atrás.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_tucked_twist_360', 'vault', 'I', null, 2.80, '102', 'Paloma y mortal adelante agrupado con una pirueta (360°)', 'Paloma mortal agrupado con pirueta', 'Tras la paloma de frente, el gimnasta hace un mortal adelante agrupado con una pirueta completa (360°). Con el mismo número vale el Cuervo agrupado con media pirueta añadida (180°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_tucked_twist_540', 'vault', 'I', null, 3.20, '103', 'Paloma y mortal adelante agrupado con pirueta y media (540°)', 'Kroll', 'El Kroll suma pirueta y media (540°) a un mortal adelante agrupado que sale de una paloma de frente. Hecho como Cuervo agrupado con una pirueta añadida (360°), cuenta como el mismo salto.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_tucked_twist_720', 'vault', 'I', null, 3.60, '104', 'Paloma y mortal adelante agrupado con doble pirueta (720°)', 'Canbas', 'Doble pirueta (720°) en un mortal adelante agrupado: así es el Canbas, que entra con paloma de frente. Su equivalente es el Cuervo agrupado con pirueta y media añadida (540°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_piked_twist_180', 'vault', 'I', null, 2.80, '107', 'Paloma y mortal adelante carpado con media pirueta (180°)', 'Paloma mortal carpado, media pirueta', 'Mortal adelante carpado con media pirueta (180°) después de una paloma de frente. Puede hacerse también como Cuervo carpado, sin pirueta añadida, y cuenta igual.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_piked_twist_360', 'vault', 'I', null, 3.20, '108', 'Paloma y mortal adelante carpado con una pirueta (360°)', 'Paloma mortal carpado con pirueta', 'Entrada de paloma de frente y segundo vuelo con mortal adelante carpado y una pirueta (360°). La versión Cuervo carpado con media pirueta añadida (180°) vale lo mismo.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_piked_twist_540', 'vault', 'I', null, 3.60, '109', 'Paloma y mortal adelante carpado con pirueta y media (540°)', 'Paloma mortal carpado, pirueta y media', 'Con el cuerpo carpado, el mortal adelante que sigue a la paloma de frente lleva pirueta y media (540°). Cuenta igual el Cuervo carpado con una pirueta añadida (360°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_180', 'vault', 'I', null, 3.60, '113', 'Paloma y mortal adelante extendido con media pirueta (180°)', 'Paloma mortal extendido, media pirueta', 'La paloma de frente da paso a un mortal adelante extendido con media pirueta (180°). Equivale al Cuervo extendido sin pirueta añadida.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_360', 'vault', 'I', null, 4.00, '114', 'Paloma y mortal adelante extendido con una pirueta (360°)', 'Paloma mortal extendido con pirueta', 'Una pirueta (360°) en un mortal adelante extendido, entrando con paloma de frente. También vale hecho como Cuervo extendido con media pirueta añadida (180°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_540', 'vault', 'I', null, 4.40, '115', 'Paloma y mortal adelante extendido con pirueta y media (540°)', 'Lou-Yun', 'El Lou-Yun es una paloma de frente seguida de mortal adelante extendido con pirueta y media (540°). El Cuervo extendido con una pirueta añadida (360°) cuenta con el mismo número.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_720', 'vault', 'I', null, 4.80, '116', 'Paloma y mortal adelante extendido con doble pirueta (720°)', 'Paloma mortal extendido, doble pirueta', 'Doble pirueta (720°) en el mortal adelante extendido que sigue a la paloma de frente. Cuenta igual el Cuervo extendido con pirueta y media añadida (540°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_900', 'vault', 'I', null, 5.20, '117', 'Paloma y mortal adelante extendido con dos piruetas y media (900°)', 'Yeo 2', 'Dos piruetas y media (900°) en un mortal adelante extendido, después de una paloma de frente: es el Yeo 2.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched_twist_1080', 'vault', 'I', null, 5.60, '118', 'Paloma y mortal adelante extendido con triple pirueta (1080°)', 'Yang Hak Seon', 'El Yang Hak Seon entra con paloma de frente y gira una triple pirueta (1080°) en un mortal adelante extendido.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_tucked', 'vault', 'I', null, 2.40, '119', 'Paloma lateral, cuarto de giro y mortal adelante agrupado con media pirueta (180°)', 'Kasamatsu', 'Con media pirueta (180°) en un mortal adelante agrupado, el Kasamatsu entra con paloma lateral e incluye un cuarto de giro. El Tsukahara agrupado con una pirueta (360°) cuenta con el mismo número.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_tucked_twist_540', 'vault', 'I', null, 2.80, '120', 'Tsukahara agrupado con pirueta y media (540°)', 'Tsukahara agrupado con pirueta y media', 'Pirueta y media (540°) en un Tsukahara agrupado. Con el mismo número cuenta el Kasamatsu agrupado con media pirueta añadida (180°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_tucked_twist_720', 'vault', 'I', null, 3.20, '121', 'Tsukahara agrupado con doble pirueta (720°)', 'Barbieri', 'El Barbieri es un Tsukahara agrupado con doble pirueta (720°).', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_tucked_twist_900', 'vault', 'I', null, 3.60, '122', 'Tsukahara agrupado con dos piruetas y media (900°)', 'Tsukahara agrupado, dos piruetas y media', 'Forma Tsukahara con el mortal agrupado y dos piruetas y media (900°) en el segundo vuelo.', 86, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_stretched_twist_360', 'vault', 'I', null, 3.60, '125', 'Tsukahara extendido con una pirueta (360°)', 'Tsukahara extendido con pirueta', 'Una pirueta (360°) sobre un Tsukahara extendido. Vale lo mismo un Kasamatsu extendido sin pirueta añadida.', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_stretched_twist_180', 'vault', 'I', null, 4.00, '126', 'Kasamatsu extendido con media pirueta añadida (180°)', 'Kasamatsu extendido con media pirueta', 'Kasamatsu extendido al que se añade media pirueta (180°). Cuenta igual el Tsukahara extendido con pirueta y media (540°).', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_stretched_twist_360', 'vault', 'I', null, 4.40, '127', 'Kasamatsu extendido con una pirueta añadida (360°)', 'Akopian', 'El Akopian añade una pirueta (360°) al Kasamatsu extendido. Equivale a un Tsukahara extendido con doble pirueta (720°).', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_stretched_twist_540', 'vault', 'I', null, 4.80, '131', 'Kasamatsu extendido con pirueta y media añadida (540°)', 'Driggs', 'Sobre la forma Kasamatsu, con el cuerpo extendido, el Driggs añade pirueta y media (540°).', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_stretched_twist_720', 'vault', 'I', null, 5.20, '132', 'Kasamatsu extendido con doble pirueta añadida (720°)', 'López', 'Doble pirueta añadida (720°) a un Kasamatsu extendido: es el López.', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_kasamatsu_stretched_twist_900', 'vault', 'I', null, 5.60, '133', 'Kasamatsu extendido con dos piruetas y media añadidas (900°)', 'Yonekura', 'El Yonekura lleva dos piruetas y media (900°) añadidas al Kasamatsu extendido. Cuenta igual el Tsukahara extendido con tres piruetas y media (1260°).', 87, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd', 'vault', 'II', null, 1.20, '201', 'Paloma de frente sin mortal', 'Paloma', 'La paloma de frente en su forma básica: el gimnasta apoya las manos en la mesa y sale en el segundo vuelo sin mortal ni pirueta.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd_twist_180', 'vault', 'II', null, 1.40, '202', 'Paloma de frente con media pirueta (180°), sin mortal', 'Paloma con media pirueta', 'Sin mortal: tras la paloma de frente, el segundo vuelo lleva solo media pirueta (180°).', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd_twist_360', 'vault', 'II', null, 1.60, '203', 'Paloma de frente con una pirueta (360°), sin mortal', 'Paloma con pirueta', 'Paloma de frente con una pirueta (360°) en el segundo vuelo y sin mortal.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd_twist_540', 'vault', 'II', null, 1.80, '204', 'Paloma de frente con pirueta y media (540°), sin mortal', 'Paloma con pirueta y media', 'Pirueta y media (540°) en el segundo vuelo de una paloma de frente, sin hacer mortal.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd_twist_720', 'vault', 'II', null, 2.00, '205', 'Paloma de frente con doble pirueta (720°), sin mortal', 'Paloma con doble pirueta', 'Entra con paloma de frente y, sin mortal, gira una doble pirueta (720°) en el segundo vuelo.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_fwd_twist_900', 'vault', 'II', null, 2.20, '206', 'Paloma de frente con dos piruetas y media (900°), sin mortal', 'Tsygankov', 'El Tsygankov es una paloma de frente sin mortal, con dos piruetas y media (900°) en el segundo vuelo.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_tucked', 'vault', 'II', null, 2.00, '207', 'Paloma y mortal adelante agrupado', 'Paloma mortal agrupado', 'Paloma de frente seguida de un mortal adelante agrupado, sin pirueta.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_piked', 'vault', 'II', null, 2.40, '213', 'Paloma y mortal adelante carpado', 'Paloma mortal carpado', 'Tras la paloma de frente, mortal adelante carpado sin pirueta.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_stretched', 'vault', 'II', null, 3.20, '219', 'Paloma y mortal adelante extendido', 'Paloma mortal extendido', 'Con el cuerpo extendido y sin pirueta, el mortal adelante sale de una paloma de frente.', 88, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_double_salto_fwd_tucked', 'vault', 'II', null, 4.80, '225', 'Paloma y doble mortal adelante agrupado', 'Roche', 'Doble mortal adelante agrupado después de una paloma de frente: es el Roche.', 89, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_roche_twist_180', 'vault', 'II', null, 5.20, '226', 'Roche con media pirueta (180°)', 'Dragulescu', 'El Dragulescu es un Roche con media pirueta (180°): paloma de frente y doble mortal adelante agrupado, como en el Roche.', 89, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_salto_fwd_tucked_twist_180_salto_bwd_tucked', 'vault', 'II', null, 5.20, '228', 'Paloma, mortal adelante agrupado con media pirueta (180°) y mortal atrás', 'Zimmerman', 'Mezcla sentidos: tras la paloma de frente llega un doble mortal agrupado, el primero adelante con media pirueta (180°) y el segundo atrás. Es el Zimmerman.', 89, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_double_salto_fwd_piked', 'vault', 'II', null, 5.20, '231', 'Paloma y doble mortal adelante carpado', 'Blanik', 'Paloma de frente y doble mortal adelante carpado: es el Blanik.', 89, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_dragulescu_piked', 'vault', 'II', null, 5.60, '232', 'Dragulescu carpado: doble mortal adelante carpado con media pirueta (180°)', 'Ri Se Gwang 2', 'Es un Dragulescu carpado: tras la paloma de frente, doble mortal adelante carpado con media pirueta (180°).', 89, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_sideways_twist_90', 'vault', 'III', null, 1.20, '301', 'Paloma lateral con un cuarto de giro (90°), sin mortal', 'Paloma lateral, cuarto de giro', 'Paloma lateral con un cuarto de giro (90°) y sin mortal.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_sideways_twist_270', 'vault', 'III', null, 1.40, '302', 'Paloma lateral con tres cuartos de giro (270°), sin mortal', 'Paloma lateral, tres cuartos de giro', 'Tres cuartos de giro (270°) en una paloma lateral; no hay mortal.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_handspring_sideways_twist_450', 'vault', 'III', null, 1.60, '303', 'Paloma lateral con giro y cuarto (450°), sin mortal', 'Paloma lateral, giro y cuarto', 'Entra de lado con paloma lateral y da un giro y cuarto (450°) sin hacer mortal.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_tucked', 'vault', 'III', null, 1.80, '307', 'Paloma lateral, cuarto de giro y mortal atrás agrupado', 'Tsukahara', 'El Tsukahara clásico: paloma lateral, un cuarto de giro y mortal atrás agrupado.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_piked', 'vault', 'III', null, 2.00, '308', 'Tsukahara carpado', 'Tsukahara carpado', 'Forma Tsukahara con el mortal carpado y sin pirueta.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_tucked_twist_180', 'vault', 'III', null, 2.00, '309', 'Tsukahara agrupado con media pirueta (180°)', 'Tsukahara agrupado con media pirueta', 'Media pirueta (180°) en un Tsukahara agrupado.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_stretched', 'vault', 'III', null, 2.80, '313', 'Tsukahara extendido', 'Tsukahara extendido', 'Tsukahara con el cuerpo extendido, sin pirueta.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_stretched_twist_180', 'vault', 'III', null, 3.20, '314', 'Tsukahara extendido con media pirueta (180°)', 'Tsukahara extendido con media pirueta', 'Tsukahara extendido que añade media pirueta (180°).', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_double_salto_bwd_tucked', 'vault', 'III', null, 4.80, '319', 'Doble mortal atrás agrupado con entrada Tsukahara', 'Yeo', 'Tras la entrada Tsukahara, el Yeo hace dos mortales atrás agrupados en el segundo vuelo.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_tsukahara_double_salto_bwd_piked', 'vault', 'III', null, 5.20, '320', 'Doble mortal atrás carpado con entrada Tsukahara', 'Lu Yu Fu', 'El Lu Yu Fu entra en Tsukahara y en el segundo vuelo encadena dos mortales atrás carpados.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null),
  ('mvt_double_tsukahara_twist_360', 'vault', 'III', null, 5.60, '321', 'Doble mortal atrás con entrada Tsukahara y una pirueta (360°)', 'Ri Se Gwang', 'Doble Tsukahara con una pirueta (360°): tras la entrada Tsukahara, dos mortales atrás en el segundo vuelo. Es el Ri Se Gwang.', 90, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 8, 'draft', null);

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
