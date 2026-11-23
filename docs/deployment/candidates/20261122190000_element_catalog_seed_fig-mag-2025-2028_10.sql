-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 10.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 57 elementos (parallel_bars).
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
  ('mpb_sp_swing_to_handstand', 'parallel_bars', 'II', 'A', null, 'II.1', 'Vuelo al pino en apoyo', 'Vuelo al pino', 'Llegar al pino a partir de un vuelo; lo habitual es arrancar balanceándose en apoyo. Cuenta cualquier variante del vuelo.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_kato_bent_arm_swing_fwd_hop_half_turn', 'parallel_bars', 'II', 'B', null, 'II.2', 'Kato: vuelo adelante con brazos flexionados, salto de manos y medio giro al apoyo', 'Kato', 'Medio giro (180°) en el aire tras un vuelo adelante hecho con los brazos flexionados: las manos saltan, el cuerpo gira y se recoge de nuevo en apoyo.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_stutz_fwd_to_handstand', 'parallel_bars', 'II', 'C', null, 'II.3', 'Stützkehre adelante al pino', 'Stützkehre adelante al pino', 'Stützkehre adelante que termina en el pino, ya sea sobre las dos barras o sobre una sola.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_stutz_fwd_to_handstand_one_rail', 'parallel_bars', 'II', 'D', null, 'II.4', 'Stützkehre adelante al pino en una barra', 'Bilozerchev-Peters / Dimic', 'Stützkehre adelante al pino en una barra con giro añadido de un cuarto (90°) o tres cuartos (270°); sin giro solo vale aquí unido a un elemento tipo Healy (si no, cuenta como la II.3). Nombres: Bilozerchev-Peters y Dimic. Lectura de Zaltyko: el Código cita la forma en una barra en dos casillas.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_l_sit_hold', 'parallel_bars', 'II', 'A', null, 'II.7', 'Ángulo mantenido', 'Ángulo', 'Ángulo mantenido 2 s, sobre las dos barras o sobre una sola; vale cualquier variante del ángulo.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_press_to_handstand', 'parallel_bars', 'II', 'B', null, 'II.8', 'Subir al pino a fuerza', 'Pino a fuerza', 'Subida a fuerza hasta el pino, que se mantiene 2 s; suele arrancar desde el ángulo. Vale con brazos flexionados y cuerpo extendido, con brazos rectos y cuerpo carpado o con piernas abiertas, y en todos los casos puede acabar en una o en dos barras.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_salazar_three_quarter_diamidov_half_turn_upper_arm', 'parallel_bars', 'II', 'C', null, 'II.9', 'Salazar: Diamidov de tres cuartos con medio giro al braquial', 'Salazar', 'Acaba en apoyo braquial: tras un vuelo adelante, normalmente desde el apoyo, hace un Diamidov de tres cuartos (270°) y a continuación medio giro (180°) hasta caer sobre los brazos.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_de_freitas_three_quarter_diamidov_rear_vault_side_hang', 'parallel_bars', 'II', 'D', null, 'II.10', 'De Freitas: Diamidov de tres cuartos y pasada dorsal a suspensión lateral', 'De Freitas', 'Lo habitual es salir del pino: vuelo adelante, Diamidov de tres cuartos (270°) y pasada dorsal por encima de una barra para quedar en suspensión lateral en ella.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_straddle_cut_bwd_to_support', 'parallel_bars', 'II', 'A', null, 'II.13', 'Corte atrás con piernas abiertas al apoyo', 'Corte atrás al apoyo', 'Termina en apoyo tras un corte hacia atrás con las piernas abiertas.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_straddle_cut_bwd_to_handstand', 'parallel_bars', 'II', 'B', null, 'II.14', 'Corte atrás con piernas abiertas al pino', 'Corte atrás al pino', 'El corte hacia atrás con piernas abiertas se lleva aquí hasta el pino, en lugar de quedarse en apoyo.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_babos_straddle_cut_bwd_to_hang', 'parallel_bars', 'II', 'C', null, 'II.15', 'Babos: corte atrás con piernas abiertas a la suspensión', 'Babos', 'Sin pasar por el apoyo, el corte atrás con piernas abiertas lleva directamente a la suspensión. Suele empezar desde el pino.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_straddle_cut_fwd_to_support_or_l_sit', 'parallel_bars', 'II', 'A', null, 'II.19', 'Corte adelante con piernas abiertas al apoyo o al ángulo', 'Corte adelante', 'Corte hacia adelante con las piernas abiertas que acaba en apoyo; también vale terminar en ángulo y mantenerlo.', 100, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_diamidov_swing_fwd_full_turn_one_arm', 'parallel_bars', 'II', 'C', null, 'II.27', 'Diamidov: vuelo adelante con giro (360°) sobre un brazo al pino', 'Diamidov', 'Giro completo (360°) sobre un brazo al final de un vuelo adelante, que suele salir del apoyo, hasta el pino; vale lo mismo acabar sobre las dos barras que sobre una sola.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_diamidov_with_extra_turn', 'parallel_bars', 'II', 'D', null, 'II.28', 'Diamidov con giro añadido (90° o 180°)', 'Diamidov con giro añadido', 'Diamidov que no se para al completar la vuelta (360°): el mismo giro sigue, sin corte, un cuarto (90°) o medio (180°) más hasta quedar en el pino.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_carminucci_swing_fwd_full_turn_upper_arm', 'parallel_bars', 'II', 'B', null, 'II.32', 'Carminucci: vuelo adelante con giro (360°) al braquial', 'Carminucci', 'Termina en apoyo braquial después de un vuelo adelante con un giro completo (360°).', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_swing_fwd_five_quarter_turn_healy_upper_arm', 'parallel_bars', 'II', 'D', null, 'II.34', 'Vuelo adelante con giro (450°) sobre un brazo y Healy al braquial', 'Giro (450°) y Healy al braquial', 'Combina dos giros: primero, en el vuelo adelante, gira sobre un brazo (450°) pasando por el pino; después enlaza un Healy que acaba en apoyo braquial. Suele empezar en el pino.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_makuts_three_quarter_diamidov_three_quarter_healy', 'parallel_bars', 'II', 'E', null, 'II.35', 'Makuts: Diamidov de tres cuartos y Healy de tres cuartos al apoyo', 'Makuts', 'El giro total (540°) se reparte en dos partes: tras el vuelo adelante, un Diamidov de tres cuartos (270°) y luego un Healy de tres cuartos (270°) sobre el otro brazo, hasta el apoyo. Una breve detención entre ambas partes no le quita valor; quedarse 2 s, sí.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_zonderland_five_quarter_turn_healy_support', 'parallel_bars', 'II', 'F', null, 'II.36', 'Zonderland: vuelo adelante con giro (450°) sobre un brazo y Healy al apoyo', 'Zonderland', 'Es la versión que acaba en apoyo: desde el pino, que es lo habitual, vuelo adelante girando sobre un brazo (450°) a través del pino y enlace con un Healy.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_carballo_swing_fwd_handstand_hop_support', 'parallel_bars', 'II', 'B', null, 'II.38', 'Carballo: vuelo adelante por el pino con salto de manos al apoyo', 'Carballo', 'En el vuelo adelante el cuerpo pasa por el pino y, con un salto de manos, vuelve a caer en apoyo.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_salto_bwd_to_handstand', 'parallel_bars', 'II', 'C', null, 'II.39', 'Mortal atrás al pino', 'Mortal atrás al pino', 'Mortal atrás que termina en el pino. Cuenta igual si acaba en una sola barra, forma que suele salir del pino y que lleva el nombre de Rumbutis.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_salto_bwd_straddle_cut_to_support', 'parallel_bars', 'II', 'D', null, 'II.40', 'Mortal atrás con corte de piernas abiertas al apoyo', 'Mortal atrás con corte', 'Dentro del mortal atrás hay un corte de piernas abiertas y el gimnasta termina en apoyo.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_toumilovich_salto_bwd_half_turn_upper_arm', 'parallel_bars', 'II', 'C', null, 'II.45', 'Toumilovich: mortal atrás con medio giro al braquial', 'Toumilovich', 'Mortal atrás con medio giro (180°) que se recoge en apoyo braquial. Prohibido para júniors.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_salto_bwd_to_handstand_one_rail_into_healy', 'parallel_bars', 'II', 'D', null, 'II.46', 'Mortal atrás al pino en una barra con enlace a Healy', 'Mortal atrás a una barra y Healy', 'Desde el pino, como suele hacerse, mortal atrás hasta el pino en una sola barra, y de ahí tiene que enlazar con un elemento tipo Healy. Solo gana valor si ese Healy sale sin una falta grande.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_morisue_double_salto_tuck_upper_arm', 'parallel_bars', 'II', 'E', null, 'II.47', 'Morisue: doble mortal atrás agrupado al braquial', 'Morisue', 'Doble mortal atrás agrupado que termina en apoyo braquial; suele salir del pino. Prohibido para júniors. Si en el mismo ejercicio aparece también el Huang Liping, solo cuenta el de más valor.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_huang_liping_double_salto_pike_upper_arm', 'parallel_bars', 'II', 'F', null, 'II.48', 'Huang Liping: doble mortal atrás carpado al braquial', 'Huang Liping', 'La versión carpada del doble mortal atrás al apoyo braquial, que suele salir del pino. No pueden contar a la vez este y el Morisue; vale el de más valor. Prohibido para júniors.', 101, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_suarez_one_and_half_salto_bwd_half_turn', 'parallel_bars', 'II', 'D', null, 'II.52', 'Suarez: mortal y medio atrás con medio giro al braquial', 'Suarez', 'Llega al apoyo braquial después de un mortal y medio atrás con medio giro (180°). Prohibido para júniors.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_kuavita_double_salto_bwd_half_turn', 'parallel_bars', 'II', 'G', null, 'II.54', 'Kuavita: doble mortal atrás con medio giro al braquial', 'Kuavita', 'Doble mortal atrás con medio giro (180°), que suele arrancar desde el pino y termina en apoyo braquial. Prohibido para júniors.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_handstand_quarter_turn_fall_back_support', 'parallel_bars', 'II', 'B', null, 'II.56', 'Pino con giro (90°) y caída atrás con giro (90°) al apoyo', 'Pino, giro y caída atrás', 'En el pino gira un cuarto (90°), se deja caer hacia atrás y, con otro cuarto de giro (90°) en la caída, queda en apoyo.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_brandstrom_handstand_three_quarter_turn_fall_back', 'parallel_bars', 'II', 'C', null, 'II.57', 'Brändström: giro (270°) en el pino y caída atrás con giro (90°) al apoyo', 'Brändström', 'Tres cuartos de giro (270°) en el pino antes de dejarse caer hacia atrás; durante la caída añade un cuarto de giro (90°) y termina en apoyo.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_stutz_bwd_to_support', 'parallel_bars', 'II', 'B', null, 'II.62', 'Stützkehre atrás al apoyo', 'Stützkehre atrás', 'Cambio hacia atrás (Stützkehre atrás) que termina en apoyo.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_novikov_stutz_bwd_through_handstand', 'parallel_bars', 'II', 'C', null, 'II.63', 'Novikov: Stützkehre atrás por el pino al apoyo', 'Novikov', 'Stützkehre atrás que pasa por el pino antes de bajar al apoyo.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_stutz_bwd_straddle_cut_bwd_support', 'parallel_bars', 'II', 'C', null, 'II.69', 'Stützkehre atrás con corte atrás de piernas abiertas al apoyo', 'Stützkehre atrás con corte', 'Al Stützkehre atrás se le añade un corte atrás con piernas abiertas; termina en apoyo.', 102, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_healy_to_upper_arm', 'parallel_bars', 'II', 'A', null, 'II.73', 'Healy al braquial', 'Healy al braquial', 'Desde el pino colocado de través, en una o en dos barras, Healy que termina en apoyo braquial. Para contar como Healy, el giro tiene que ser completo (360°).', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_healy_upper_arm_after_one_rail_swing', 'parallel_bars', 'II', 'B', null, 'II.74', 'Healy al braquial tras un vuelo al pino en una barra', 'Healy al braquial tras vuelo', 'Healy al apoyo braquial que arranca del pino en una barra, al que se ha llegado con un elemento de vuelo de valor B o más. También cuenta aquí, con valor B, un Healy de tres cuartos (270°) desde una posición lateral.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_healy_to_support', 'parallel_bars', 'II', 'C', null, 'II.75', 'Healy al apoyo', 'Healy', 'El Healy que da nombre a la familia: desde el pino de través, en una o dos barras, gira hasta caer en apoyo. Solo es tipo Healy con el giro entero (360°).', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_bejenaru_healy_support_after_one_rail_swing', 'parallel_bars', 'II', 'D', null, 'II.76', 'Bejenaru: Healy al apoyo tras un vuelo al pino en una barra', 'Bejenaru', 'Healy (360° o más) que termina en apoyo, saliendo del pino en una barra al que se llega con un elemento de vuelo de valor B o más.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_swing_bwd_half_turn_hop_handstand', 'parallel_bars', 'II', 'C', null, 'II.81', 'Vuelo atrás con giro (180°) y salto de manos al pino', 'Vuelo atrás con giro (180°) al pino', 'En el vuelo atrás hace medio giro (180°) con salto de manos y llega al pino.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_swing_bwd_three_quarter_turn_hop_handstand', 'parallel_bars', 'II', 'D', null, 'II.82', 'Vuelo atrás con giro (270°) y salto de manos al pino en una barra', 'Vuelo atrás con giro (270°) a una barra', 'Tres cuartos de giro (270°) con salto de manos en el vuelo atrás, hasta el pino sobre una sola barra.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_gatson_1_swing_bwd_full_turn_hop', 'parallel_bars', 'II', 'E', null, 'II.83', 'Gatson 1: vuelo atrás con giro (360°) y salto de manos al pino', 'Gatson 1', 'Giro completo (360°) con salto de manos durante el vuelo atrás, hasta el pino.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_gatson_2', 'parallel_bars', 'II', 'F', null, 'II.84', 'Gatson 2: Gatson 1 con dos giros de 90° hasta el pino en las dos barras', 'Gatson 2', 'Empieza como un Gatson 1 y no se detiene: un cuarto de giro (90°) lo lleva al pino en una barra y otro (90°) lo devuelve al pino sobre las dos.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_handstand_one_rail_half_or_three_quarter_turn', 'parallel_bars', 'II', 'B', null, 'II.86', 'Giro en el pino en una barra (180° o 270°)', 'Giro en el pino en una barra', 'Termina en el pino después de medio giro (180°) o tres cuartos (270°), hacia delante o hacia atrás, que empieza con el cuerpo sobre una sola barra.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_patron_2_swing_bwd_quarter_turn_hop_one_rail', 'parallel_bars', 'II', 'C', null, 'II.87', 'Patron 2: vuelo atrás con giro (270°) en sentido contrario y salto de manos al pino en una barra', 'Patron 2', 'Acaba en el pino sobre una barra tras un solo giro de tres cuartos (270°) en sentido contrario durante el vuelo atrás; el salto de manos llega después del primer cuarto (90°).', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_patron_swing_bwd_full_turn_early_hop', 'parallel_bars', 'II', 'D', null, 'II.88', 'Patron: vuelo atrás con giro (360°) y salto de manos temprano al pino', 'Patron', 'Giro completo (360°) en el vuelo atrás con un salto de manos que llega antes de completar tres cuartos (270°); termina en el pino. También cuenta girando en sentido contrario.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_handstand_half_turn', 'parallel_bars', 'II', 'A', null, 'II.91', 'Pino con medio giro', 'Pino con medio giro', 'Medio giro (180°) en el pino, también manteniendo el pino 2 s al acabar; vale cualquier variante del pino.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_handstand_full_pirouette_two_rails', 'parallel_bars', 'II', 'B', null, 'II.92', 'Giro completo en el pino sobre las dos barras', 'Giro en el pino (360°)', 'Sobre las dos barras, una vuelta entera (360°) en el pino; cuenta cualquier forma de hacer el giro.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_hall_five_quarter_salto_fwd_straddled_half_turn', 'parallel_bars', 'II', 'E', null, 'II.95', 'Hall: mortal y cuarto adelante con piernas abiertas y medio giro al braquial', 'Hall', 'Mortal y cuarto adelante con piernas abiertas y medio giro (180°), recogido en apoyo braquial. Prohibido para júniors.', 103, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_carballo_2_salto_fwd_from_handstand', 'parallel_bars', 'II', 'C', null, 'II.99', 'Carballo 2: mortal adelante desde el pino al apoyo', 'Carballo 2', 'Llega al apoyo con un mortal adelante que sale directamente del pino. Otra forma que cuenta igual: desde el pino con agarre cubital, inlocación hasta el apoyo.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_five_quarter_salto_fwd_straddled_to_hang', 'parallel_bars', 'II', 'E', null, 'II.101', 'Mortal y cuarto adelante con piernas abiertas a la suspensión', 'Lee Chul Hon / Sasaki', 'Va directo a la suspensión, sin pasar por el apoyo, tras un mortal y cuarto adelante con piernas abiertas. Con las formas que llegan al braquial o al apoyo con brazos flexionados solo cuenta una, la de más valor.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_five_quarter_salto_fwd_tuck_or_pike_upper_arm', 'parallel_bars', 'II', 'B', null, 'II.104', 'Mortal y cuarto adelante agrupado o carpado al braquial', 'Mortal y cuarto agrupado o carpado', 'Mortal y cuarto adelante, agrupado o carpado, que termina en apoyo braquial. Prohibido para júniors.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_salto_fwd_to_support', 'parallel_bars', 'II', 'C', null, 'II.105', 'Mortal adelante al apoyo', 'Mortal adelante al apoyo', 'Termina en apoyo tras un mortal hacia adelante.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_five_quarter_salto_fwd_straddled_upper_arm', 'parallel_bars', 'II', 'D', null, 'II.106', 'Mortal y cuarto adelante con piernas abiertas al braquial', 'Mortal y cuarto abierto al braquial', 'Con las piernas abiertas, mortal y cuarto adelante hasta el apoyo braquial. Prohibido para júniors; si también se hace el que va a la suspensión o el que acaba con brazos flexionados, solo vale uno, el de más valor.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_five_quarter_salto_fwd_straddled_bent_arm_support', 'parallel_bars', 'II', 'E', null, 'II.107', 'Mortal y cuarto adelante con piernas abiertas al apoyo con brazos flexionados', 'Mortal y cuarto abierto, brazos doblados', 'Acaba en apoyo con los brazos flexionados y por eso es un elemento propio, aparte del que llega al braquial. Prohibido para júniors; con sus formas hermanas (braquial y suspensión) solo cuenta la de más valor.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_juarez_2_salto_fwd_piked_to_hang', 'parallel_bars', 'II', 'C', null, 'II.111', 'Juarez 2: mortal adelante carpado a la suspensión', 'Juarez 2', 'Mortal adelante carpado que llega a la suspensión.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_double_salto_fwd_tuck_upper_arm', 'parallel_bars', 'II', 'E', null, 'II.113', 'Doble mortal adelante agrupado al braquial', 'Doble mortal adelante agrupado', 'Doble mortal adelante agrupado hasta el apoyo braquial. Prohibido para júniors.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_double_salto_fwd_pike_upper_arm', 'parallel_bars', 'II', 'F', null, 'II.114', 'Doble mortal adelante carpado al braquial', 'Doble mortal adelante carpado', 'La forma carpada del doble mortal adelante, recogida en apoyo braquial. Prohibido para júniors.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_five_quarter_salto_fwd_straight_upper_arm', 'parallel_bars', 'II', 'C', null, 'II.117', 'Mortal y cuarto adelante extendido al braquial', 'Mortal y cuarto extendido al braquial', 'Con el cuerpo extendido, mortal y cuarto adelante que termina en apoyo braquial. Prohibido para júniors.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date),
  ('mpb_sp_urzica_salto_fwd_full_turn_upper_arm', 'parallel_bars', 'II', 'E', null, 'II.119', 'Urzica: mortal adelante con giro (360°) al braquial', 'Urzica', 'Mortal adelante con un giro completo (360°) y llegada al apoyo braquial. Prohibido para júniors.', 104, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 10, 'reviewed', '2026-11-23'::date);

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
