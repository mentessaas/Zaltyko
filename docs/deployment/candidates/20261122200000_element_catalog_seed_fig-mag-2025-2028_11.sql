-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 11.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 58 elementos (parallel_bars).
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
  ('mpb_ui_fwd_uprise_support', 'parallel_bars', 'I', 'A', null, 'I.1', 'Subida adelante desde braquial al apoyo', 'Subida adelante al apoyo', 'Desde el apoyo braquial, subida adelante hasta quedar en apoyo.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_straddle_cut_bwd_handstand', 'parallel_bars', 'I', 'B', null, 'I.2', 'Subida adelante con corte atrás de piernas abiertas al pino', 'Subida adelante y corte al pino', 'Termina en el pino: tras la subida adelante desde el apoyo braquial, las piernas abiertas hacen un corte hacia atrás.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_straddle_cut_bwd_hang', 'parallel_bars', 'I', 'C', null, 'I.3', 'Muntean: subida adelante con corte atrás de piernas abiertas a la suspensión', 'Muntean', 'Acaba en suspensión: subida adelante desde el apoyo braquial y corte hacia atrás con las piernas abiertas.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_half_turn_handstand', 'parallel_bars', 'I', 'E', null, 'I.5', 'Subida adelante con medio giro al pino', 'Subida adelante con medio giro al pino', 'Medio giro (180°) unido a la subida adelante desde el apoyo braquial, hasta el pino.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_stutzkehr_handstand', 'parallel_bars', 'I', 'F', null, 'I.6', 'Subida adelante con Stützkehre al pino en una barra', 'Subida adelante y Stützkehre al pino', 'Acaba en el pino sobre una sola barra: desde el apoyo braquial, la subida adelante enlaza con un Stützkehre de tres cuartos (270°) o de un cuarto (90°).', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_quarter_turn_hang_one_rail', 'parallel_bars', 'I', 'A', null, 'I.7', 'Subida adelante con cuarto de giro a suspensión en una barra', 'Subida adelante y cuarto de giro', 'Acaba colgado de una sola barra: subida adelante desde el apoyo braquial con un cuarto de giro (90°) hasta la suspensión en esa barra.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_half_turn_or_fwd_uprise_kato_hop', 'parallel_bars', 'I', 'B', null, 'I.8', 'Watanabe: voltereta atrás con medio giro o subida adelante con salto tipo Kato', 'Watanabe', 'Dos formas con el mismo valor, ambas del apoyo braquial al apoyo: una voltereta atrás con medio giro (180°), o una subida adelante con un salto de manos tipo Kato.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_makuts_upper_arm', 'parallel_bars', 'I', 'E', null, 'I.11', 'Subida adelante y Makuts al braquial', 'Subida adelante y Makuts al braquial', 'Después de la subida adelante desde el apoyo braquial encadena un Makuts y vuelve a caer en apoyo braquial. Si se detiene un momento tras la primera parte conserva el valor; si se queda 2 s, lo pierde.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_makuts_support', 'parallel_bars', 'I', 'G', null, 'I.12', 'Tsolakidis 1: subida adelante y Makuts al apoyo', 'Tsolakidis 1', 'Termina en apoyo: subida adelante desde el apoyo braquial y, a continuación, un Makuts. Como en el Makuts, una breve pausa tras la primera parte no quita valor; mantenerla 2 s, sí.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_handstand_straight_arms', 'parallel_bars', 'I', 'B', null, 'I.14', 'Voltereta atrás con brazos extendidos al pino', 'Voltereta atrás al pino', 'Con los brazos extendidos, voltereta atrás desde el apoyo braquial hasta el pino.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_back_toss_quarter_turn_one_rail', 'parallel_bars', 'I', 'C', null, 'I.15', 'Kovtun: lanzamiento atrás con cuarto de giro al pino en una barra', 'Kovtun', 'Termina en el pino sobre una sola barra: desde el apoyo braquial, lanzamiento atrás con un cuarto de giro (90°).', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_full_turn_handstand', 'parallel_bars', 'I', 'E', null, 'I.17', 'Richards: subida adelante con giro (360°) al pino', 'Richards', 'Giro completo (360°) en la subida adelante desde el apoyo braquial, hasta llegar al pino.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_fwd_uprise_one_and_half_turn_handstand', 'parallel_bars', 'I', 'F', null, 'I.18', 'Tsolakidis 2: subida adelante con giro (540°) al pino', 'Tsolakidis 2', 'Llega al pino tras una vuelta y media (540°) durante la subida adelante desde el apoyo braquial.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_salto_bwd_straddle_cut_upper_arm', 'parallel_bars', 'I', 'B', null, 'I.20', 'Mortal atrás con corte de piernas abiertas al braquial', 'Mortal atrás con corte al braquial', 'Desde el apoyo braquial y de vuelta a él: mortal atrás con un corte de piernas abiertas. Prohibido para júniors.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_straddle_cut_support', 'parallel_bars', 'I', 'C', null, 'I.21', 'Voltereta atrás con corte de piernas abiertas al apoyo', 'Voltereta atrás con corte al apoyo', 'Termina en apoyo después de una voltereta atrás desde el apoyo braquial con corte de piernas abiertas.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_salto_bwd_tuck_upper_arm', 'parallel_bars', 'I', 'F', null, 'I.24', 'Dimitrenko: voltereta atrás y mortal atrás agrupado al braquial', 'Dimitrenko', 'Encadena voltereta atrás y mortal atrás agrupado, de apoyo braquial a apoyo braquial. Prohibido para júniors.', 97, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_salto_bwd_pike_upper_arm', 'parallel_bars', 'I', 'G', null, 'I.30', 'Li Xiaopeng: voltereta atrás y mortal atrás carpado al braquial', 'Li Xiaopeng', 'Es la forma carpada: tras la voltereta atrás desde el apoyo braquial, mortal atrás carpado que vuelve a caer en braquial. Prohibido para júniors.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_half_turn_tuck_upper_arm', 'parallel_bars', 'I', 'D', null, 'I.34', 'Harada: voltereta atrás agrupada con medio giro al braquial', 'Harada', 'Medio giro (180°) en una voltereta atrás agrupada que sale del apoyo braquial y vuelve a él. Prohibido para júniors.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_roll_bwd_half_turn_tuck_hang', 'parallel_bars', 'I', 'E', null, 'I.35', 'Dalton: voltereta atrás agrupada con medio giro a la suspensión', 'Dalton', 'Acaba en suspensión: voltereta atrás agrupada desde el apoyo braquial con medio giro (180°).', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_handstand', 'parallel_bars', 'I', 'B', null, 'I.38', 'Subida atrás al pino', 'Subida atrás al pino', 'Desde el apoyo braquial, subida atrás hasta el pino; también vale con medio giro (180°).', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_half_turn_hop_handstand', 'parallel_bars', 'I', 'D', null, 'I.40', 'Subida atrás con medio giro y salto de manos al pino', 'Subida atrás con salto y medio giro', 'En la subida atrás desde el apoyo braquial hace medio giro (180°) con salto de manos y llega al pino.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_three_quarter_turn_hop_handstand_one_rail', 'parallel_bars', 'I', 'E', null, 'I.41', 'Subida atrás con giro (270°) y salto de manos al pino en una barra', 'Subida atrás con giro (270°) a una barra', 'Acaba en el pino sobre una sola barra: subida atrás desde el apoyo braquial con tres cuartos de giro (270°) y salto de manos.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_half_turn_straddle_cut_upper_arm', 'parallel_bars', 'I', 'B', null, 'I.44', 'Subida atrás con medio giro y corte atrás de piernas abiertas al braquial', 'Subida atrás, giro y corte al braquial', 'Vuelve al apoyo braquial después de una subida atrás con medio giro (180°) y un corte hacia atrás con piernas abiertas.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_half_turn_straddle_cut_support', 'parallel_bars', 'I', 'C', null, 'I.45', 'Subida atrás con medio giro y corte atrás de piernas abiertas al apoyo', 'Subida atrás, giro y corte al apoyo', 'Lleva del apoyo braquial al apoyo mediante una subida atrás con medio giro (180°) y un corte hacia atrás con piernas abiertas.', 98, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_half_turn_support', 'parallel_bars', 'I', 'B', null, 'I.50', 'Subida atrás con medio giro al apoyo', 'Subida atrás con medio giro al apoyo', 'Medio giro (180°) dentro de la subida atrás, del apoyo braquial al apoyo.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_five_quarter_salto_fwd_tuck_upper_arm', 'parallel_bars', 'I', 'C', null, 'I.51', 'Yamawaki: subida atrás y mortal y cuarto adelante agrupado o carpado al braquial', 'Yamawaki', 'Mortal y cuarto adelante, agrupado o carpado (las dos formas valen lo mismo), tras la subida atrás desde el apoyo braquial y de vuelta al braquial. Prohibido para júniors en ambas formas.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_salto_fwd_support', 'parallel_bars', 'I', 'D', null, 'I.52', 'Subida atrás y mortal adelante carpado o extendido al apoyo', 'Subida atrás y mortal adelante al apoyo', 'Termina en apoyo con un mortal adelante, carpado o extendido, que sigue a la subida atrás desde el apoyo braquial.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_double_salto_fwd_tuck_upper_arm', 'parallel_bars', 'I', 'F', null, 'I.54', 'Subida atrás y doble mortal adelante agrupado al braquial', 'Subida atrás y doble mortal adelante', 'Doble mortal adelante agrupado después de la subida atrás, de braquial a braquial. Prohibido para júniors.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_five_quarter_salto_fwd_straddle_upper_arm', 'parallel_bars', 'I', 'E', null, 'I.59', 'Pakhniuk 1: subida atrás y mortal y cuarto adelante con piernas abiertas al braquial', 'Pakhniuk 1', 'Mortal y cuarto adelante con piernas abiertas tras la subida atrás, de vuelta al apoyo braquial. Prohibido para júniors. Entre sus variantes de forma o de llegada, aquí y en el grupo III, solo cuenta la de más valor.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_five_quarter_salto_fwd_straddle_hang', 'parallel_bars', 'I', 'F', null, 'I.60', 'Pakhniuk 2: subida atrás y mortal y cuarto adelante con piernas abiertas a la suspensión', 'Pakhniuk 2', 'Acaba en suspensión: subida atrás desde el apoyo braquial y mortal y cuarto adelante con piernas abiertas. Con el Pakhniuk 1 y sus formas afines del grupo III solo cuenta una, la de más valor.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_straddle_cut_or_flank_bent_arm_support', 'parallel_bars', 'I', 'A', null, 'I.61', 'Subida atrás con corte o pasada lateral al apoyo con brazos flexionados', 'Subida atrás a brazos flexionados', 'Las piernas pasan siempre por encima: abiertas, en un corte sobre las barras, o juntas, en pasada lateral sobre una barra, durante la subida atrás que lleva del apoyo braquial al apoyo con brazos flexionados.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_ui_bwd_uprise_straddle_cut_or_flank_straight_arm_support', 'parallel_bars', 'I', 'B', null, 'I.62', 'Subida atrás con corte o pasada lateral al apoyo con brazos extendidos', 'Subida atrás con pasada al apoyo', 'Las piernas pasan siempre por encima de las barras, con corte de piernas abiertas o en pasada lateral, durante la subida atrás que lleva del apoyo braquial al apoyo con brazos extendidos.', 99, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_fwd_pike_or_straight_opt_half_twist', 'parallel_bars', 'IV', 'A', null, 'IV.1', 'Salida en mortal adelante carpado o extendido, con o sin media pirueta', 'Salida mortal adelante', 'Mortal adelante de salida, carpado o extendido; puede llevar media pirueta (180°) o ninguna.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_fwd_tuck', 'parallel_bars', 'IV', 'E', null, 'IV.5', 'Salida en doble mortal adelante agrupado', 'Salida doble mortal adelante agrupado', 'Doble mortal adelante agrupado para salir de las paralelas.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_belyavskiy_double_salto_fwd_pike', 'parallel_bars', 'IV', 'F', null, 'IV.6', 'Belyavskiy: salida en doble mortal adelante carpado', 'Belyavskiy', 'La versión carpada del doble mortal adelante de salida.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_fwd_pike_or_straight_full_twist', 'parallel_bars', 'IV', 'B', null, 'IV.8', 'Salida en mortal adelante carpado o extendido con pirueta', 'Salida mortal adelante con pirueta', 'Pirueta completa (360°) en un mortal adelante de salida, carpado o extendido.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_fwd_pike_or_straight_one_and_half_twist', 'parallel_bars', 'IV', 'C', null, 'IV.9', 'Salida en mortal adelante carpado o extendido con pirueta y media', 'Mortal adelante con pirueta y media', 'Sale con un mortal adelante, carpado o extendido, y pirueta y media (540°).', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_fwd_pike_or_straight_double_or_two_and_half_twist', 'parallel_bars', 'IV', 'D', null, 'IV.10', 'Salida en mortal adelante carpado o extendido con doble pirueta o dos piruetas y media', 'Mortal adelante con doble pirueta', 'Doble pirueta (720°) o dos piruetas y media (900°) en un mortal adelante de salida, carpado o extendido.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_fwd_tuck_half_twist_or_half_twist_double_bwd', 'parallel_bars', 'IV', 'E', null, 'IV.11', 'Salida en doble mortal adelante agrupado con media pirueta', 'Doble adelante con media pirueta', 'Doble mortal adelante agrupado con media pirueta (180°), que puede hacerse al principio o al final del vuelo; las dos formas valen lo mismo.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_larduet_double_salto_fwd_tuck_full_twist', 'parallel_bars', 'IV', 'G', null, 'IV.12', 'Larduet: salida en doble mortal adelante agrupado con pirueta', 'Larduet', 'Doble mortal adelante agrupado con una pirueta (360°) para salir.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_fwd_tuck_from_end', 'parallel_bars', 'IV', 'C', null, 'IV.15', 'Salida en doble mortal adelante agrupado desde el extremo de las barras', 'Doble adelante agrupado desde el extremo', 'Desde el extremo de las barras, doble mortal adelante agrupado de salida.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_dalaloyan_double_salto_fwd_pike_half_twist', 'parallel_bars', 'IV', 'F', null, 'IV.18', 'Dalaloyan: salida en doble mortal adelante carpado con media pirueta', 'Dalaloyan', 'Doble mortal adelante carpado con media pirueta (180°); vale lo mismo hacerla pronto que tarde.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_bwd_pike_or_straight_opt_half_twist', 'parallel_bars', 'IV', 'A', null, 'IV.19', 'Salida en mortal atrás carpado o extendido, con o sin media pirueta', 'Salida mortal atrás', 'Sale con un mortal atrás, carpado o extendido, con media pirueta (180°) o sin ella.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_salto_bwd_pike_or_straight_full_or_one_and_half_twist', 'parallel_bars', 'IV', 'C', null, 'IV.21', 'Salida en mortal atrás carpado o extendido con pirueta o pirueta y media', 'Mortal atrás con pirueta', 'Un mortal atrás de salida, carpado o extendido, con pirueta (360°) o pirueta y media (540°).', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_kan_salto_bwd_straight_double_twist', 'parallel_bars', 'IV', 'D', null, 'IV.22', 'Kan: salida en mortal atrás extendido con doble pirueta', 'Kan', 'Doble pirueta (720°) en un mortal atrás extendido de salida.', 112, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_roethlisberger_high_wende_salto_bwd', 'parallel_bars', 'IV', 'D', null, 'IV.28', 'Roethlisberger: salida con Wende alta y doble mortal atrás agrupado o carpado', 'Roethlisberger', 'Tras una Wende alta, sale con un doble mortal atrás, agrupado o carpado; las dos formas valen lo mismo.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_bwd_tuck_from_end', 'parallel_bars', 'IV', 'B', null, 'IV.32', 'Salida en doble mortal atrás agrupado desde el extremo de las barras', 'Doble atrás agrupado desde el extremo', 'Sale desde el extremo de las barras con un doble mortal atrás agrupado.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_bwd_tuck', 'parallel_bars', 'IV', 'C', null, 'IV.33', 'Salida en doble mortal atrás agrupado', 'Salida doble mortal atrás agrupado', 'Doble mortal atrás agrupado de salida.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_bwd_pike', 'parallel_bars', 'IV', 'D', null, 'IV.34', 'Salida en doble mortal atrás carpado', 'Salida doble mortal atrás carpado', 'La forma carpada del doble mortal atrás de salida.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hiroyuki_kato_double_salto_bwd_tuck_full_twist', 'parallel_bars', 'IV', 'G', null, 'IV.36', 'Hiroyuki Kato: salida en doble mortal atrás agrupado con pirueta', 'Hiroyuki Kato', 'Una pirueta (360°) dentro del doble mortal atrás agrupado de salida.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_double_salto_bwd_tuck_half_twist_or_bwd_fwd', 'parallel_bars', 'IV', 'D', null, 'IV.40', 'Salida en doble mortal atrás agrupado con media pirueta, o mortal atrás y mortal adelante', 'Doble atrás con media pirueta', 'Con el mismo valor, doble mortal atrás agrupado con media pirueta (180°), o bien un mortal atrás con media pirueta (180°) seguido de un mortal adelante, ambos agrupados.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_salto_bwd_straight', 'parallel_bars', 'IV', 'A', null, 'IV.43', 'Salida en mortal atrás extendido desde suspensión en el extremo', 'Mortal atrás extendido desde suspensión', 'Colgado del extremo de las barras, sale con un mortal atrás extendido.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_double_salto_bwd_tuck', 'parallel_bars', 'IV', 'C', null, 'IV.45', 'Salida en doble mortal atrás agrupado desde suspensión en el extremo', 'Doble atrás agrupado desde suspensión', 'Doble mortal atrás agrupado que arranca de la suspensión en el extremo de las barras.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_double_salto_bwd_pike', 'parallel_bars', 'IV', 'D', null, 'IV.46', 'Salida en doble mortal atrás carpado desde suspensión en el extremo', 'Doble atrás carpado desde suspensión', 'Desde la suspensión en el extremo de las barras, doble mortal atrás carpado.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_alvarez_hang_end_double_salto_bwd_straight', 'parallel_bars', 'IV', 'E', null, 'IV.47', 'Alvarez: salida en doble mortal atrás extendido desde suspensión en el extremo', 'Alvarez', 'Doble mortal atrás con el cuerpo extendido, saliendo de la suspensión en el extremo de las barras.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_triple_salto_bwd_tuck', 'parallel_bars', 'IV', 'G', null, 'IV.48', 'Salida en triple mortal atrás agrupado desde suspensión en el extremo', 'Triple mortal atrás desde suspensión', 'Tres mortales atrás agrupados desde la suspensión en el extremo de las barras.', 113, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_double_salto_bwd_tuck_full_or_half_twist', 'parallel_bars', 'IV', 'E', null, 'IV.53', 'Salida en doble mortal atrás agrupado con pirueta o media pirueta desde suspensión en el extremo', 'Doble atrás con pirueta desde suspensión', 'Pirueta (360°) o media pirueta (180°), a elegir, en un doble mortal atrás agrupado; la salida arranca colgado del extremo de las barras.', 114, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date),
  ('mpb_dm_hang_end_double_salto_bwd_tuck_double_twist', 'parallel_bars', 'IV', 'F', null, 'IV.54', 'Salida en doble mortal atrás agrupado con doble pirueta desde suspensión en el extremo', 'Doble atrás con doble pirueta', 'Doble pirueta (720°) en un doble mortal atrás agrupado que sale de la suspensión en el extremo de las barras.', 114, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 11, 'reviewed', '2026-11-23'::date);

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
