-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 12.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 65 elementos (parallel_bars).
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
  ('mpb_hg_alsadi_swing_fwd_straddle_cut_bent_arm_regrasp_upper_arm', 'parallel_bars', 'III', 'C', null, 'III.3', 'Balanceo largo adelante con corte atrás al braquial', 'Alsadi', 'Acaba en apoyo braquial: tras un balanceo largo adelante, corta atrás con piernas abiertas y vuelve a coger las barras en la horizontal, con el cuerpo recto y los brazos flexionados. Suele salir del pino. Esa recogida flexionada y el final en braquial lo separan del Bhavsar.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_tippelt_moy_piked_straddle_cut_bwd_handstand', 'parallel_bars', 'III', 'D', null, 'III.4', 'Moy carpado con corte atrás de piernas abiertas al pino', 'Tippelt', 'Del Moy carpado sale un corte atrás con las piernas abiertas que lo lleva directo al pino al volver a coger las barras, en un solo balanceo. Suele empezar en el pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_bhavsar_swing_fwd_straddle_cut_regrasp_horizontal', 'parallel_bars', 'III', 'E', null, 'III.5', 'Balanceo largo adelante con corte atrás y recogida en la horizontal', 'Bhavsar', 'Vale solo si recoge las barras en la horizontal: con el cuerpo a más de 45° de ella o el hombro cerrado a 90°, pierde el valor. Sale del balanceo largo adelante con corte atrás de piernas abiertas, recoge con el cuerpo recto y los hombros abiertos y acaba en suspensión.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_moy_piked_straddle_cut_half_turn_upper_arm', 'parallel_bars', 'III', 'B', null, 'III.8', 'Moy carpado con corte atrás y medio giro al braquial', 'Moy con corte y medio giro', 'Termina en braquial tras un medio giro (180°): Moy carpado, corte atrás y giro antes de caer sobre los brazos. Vale lo mismo con las piernas abiertas en el corte o con las piernas juntas. Suele salir del pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_nolet_moy_piked_full_turn_upper_arm', 'parallel_bars', 'III', 'C', null, 'III.9', 'Moy carpado con giro completo al braquial', 'Nolet', 'Un Moy carpado que, en vez de quedarse en apoyo, gira entero (360°) y cae en apoyo braquial. Suele empezar en el pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_giraldo_moy_salto_fwd_upper_arm', 'parallel_bars', 'III', 'D', null, 'III.10', 'Moy con mortal adelante al braquial', 'Giraldo', 'Prohibido para júniors. Desde el Moy encadena un mortal adelante y cae en apoyo braquial; cuenta igual agrupado, carpado o con piernas abiertas. Suele arrancar del pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_moy_to_support_bent_legs', 'parallel_bars', 'III', 'B', null, 'III.14', 'Moy al apoyo con piernas flexionadas', 'Moy con piernas flexionadas', 'El Moy con las piernas flexionadas, hasta llegar al apoyo. Vale igual si no suelta las manos. Suele empezar desde el pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_moy_to_support_straight_legs', 'parallel_bars', 'III', 'C', null, 'III.15', 'Moy al apoyo con piernas extendidas', 'Moy', 'Piernas extendidas de principio a fin y llegada al apoyo con brazos extendidos. También cuenta sin soltar las manos. Suele empezar desde el pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_kenmotsu_giant_swing_bwd_handstand', 'parallel_bars', 'III', 'C', null, 'III.21', 'Molino atrás al pino', 'Kenmotsu', 'Molino atrás que suele salir del pino y vuelve a él; vale igual con un cuarto (90°) o medio giro (180°), con una inlocación adelante o acabando en una barra si no va unido a un Healy. Además de Kenmotsu, lleva el nombre de Wells.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_piasecky_giant_swing_bwd_one_rail_handstand_healy', 'parallel_bars', 'III', 'D', null, 'III.22', 'Molino atrás al pino en una barra enlazado con Healy', 'Piasecky', 'Solo cuenta así si va enlazado con un elemento tipo Healy: molino atrás que acaba en el pino sobre una sola barra. Suele salir del pino.', 105, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_giant_swing_bwd_diamidov_handstand', 'parallel_bars', 'III', 'E', null, 'III.29', 'Molino atrás y Diamidov al pino', 'Molino atrás y Diamidov', 'Al cerrar el molino atrás enlaza un Diamidov y queda en el pino. Puede acabar en una barra con el mismo valor mientras no vaya unido a un Healy. Suele salir del pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_giant_swing_diamidov_quarter_or_half_turn_handstand', 'parallel_bars', 'III', 'F', null, 'III.30', 'Molino atrás y Diamidov con giro al pino', 'Molino atrás, Diamidov y giro', 'El Diamidov que sigue al molino atrás se alarga con un cuarto (90°) o medio giro (180°) hasta el pino; las dos formas valen lo mismo. Suele salir del pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_swing_down_salto_bwd_straight_to_hang', 'parallel_bars', 'III', 'B', null, 'III.38', 'Bajada con mortal atrás extendido a la suspensión', 'Bajada y mortal atrás extendido', 'Se deja caer desde arriba, que suele ser el pino, y da un mortal atrás extendido para acabar en suspensión.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_gushiken_giant_swing_bwd_half_turn_upper_arm', 'parallel_bars', 'III', 'C', null, 'III.39', 'Molino atrás con medio giro al braquial', 'Gushiken', 'Medio giro (180°) al final de un molino atrás para caer en apoyo braquial. Suele salir del pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_marinitch_giant_swing_bwd_half_turn_support', 'parallel_bars', 'III', 'D', null, 'III.40', 'Molino atrás con medio giro al apoyo', 'Marinitch', 'Como el Gushiken, pero acaba más arriba: tras el molino atrás y el medio giro (180°) queda en apoyo con los brazos extendidos. Suele salir del pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_giant_swing_bwd_diamidov_one_rail_handstand_healy', 'parallel_bars', 'III', 'F', null, 'III.42', 'Molino atrás y Diamidov al pino en una barra, enlazado con Healy', 'Molino atrás y Diamidov a una barra', 'Debe ir unido a un elemento tipo Healy para contar así: molino atrás, Diamidov y llegada al pino sobre una sola barra. Suele salir del pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_dauser_giant_swing_bwd_makuts_upper_arm', 'parallel_bars', 'III', 'D', null, 'III.46', 'Molino atrás y Makuts al braquial', 'Dauser', 'Termina en apoyo braquial: tras el molino atrás encadena un Makuts. Suele empezar en el pino.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_baumann_giant_swing_bwd_makuts', 'parallel_bars', 'III', 'F', null, 'III.48', 'Molino atrás y Makuts', 'Baumann', 'Makuts pegado a un molino atrás; suele salir del pino y terminar en apoyo. Vale más que el Dauser, que acaba en braquial.', 107, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_giant_swing_bwd_straddle_cut_upper_arm', 'parallel_bars', 'III', 'B', null, 'III.50', 'Molino atrás con corte de piernas abiertas al braquial', 'Molino atrás y corte al braquial', 'Al acabar el molino atrás abre las piernas para el corte y cae en apoyo braquial. Suele empezar en el pino y no está permitido a júniors.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_korolev_giant_swing_bwd_straddle_cut_support', 'parallel_bars', 'III', 'D', null, 'III.52', 'Molino atrás con corte de piernas abiertas al apoyo', 'Korolev', 'Molino atrás y corte con piernas abiertas hasta el apoyo; también cuenta si llega con los brazos flexionados. Prohibido para júniors. Suele salir del pino.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_sosa_giant_swing_bwd_half_turn_straddle_cut_upper_arm', 'parallel_bars', 'III', 'E', null, 'III.53', 'Molino atrás con medio giro y corte atrás al braquial', 'Sosa', 'Medio giro (180°) y corte atrás con piernas abiertas después del molino atrás, para terminar en apoyo braquial. Suele empezar en el pino. Prohibido para júniors.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_belle_giant_swing_bwd_double_salto_tuck_upper_arm', 'parallel_bars', 'III', 'E', null, 'III.59', 'Molino atrás con doble mortal atrás agrupado al braquial', 'Belle', 'Doble mortal atrás agrupado enlazado con el molino atrás, con caída en apoyo braquial. Prohibido para júniors. Este Belle y el carpado solo cuentan una vez por ejercicio: el de más valor.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_belle_pike_double_salto_upper_arm', 'parallel_bars', 'III', 'F', null, 'III.60', 'Molino atrás con doble mortal atrás carpado (Belle carpado)', 'Belle carpado', 'Es el Belle con el cuerpo carpado: molino atrás y doble mortal atrás hasta el apoyo braquial. Prohibido para júniors. Si en el ejercicio aparecen el Belle agrupado y el carpado, solo cuenta uno, el de más valor.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_belle_full_turn', 'parallel_bars', 'III', 'H', null, 'III.66', 'Belle con pirueta (360°)', 'Belle con pirueta', 'La forma con pirueta (360°) del Belle: tras el molino atrás, doble mortal atrás agrupado con la pirueta y caída en apoyo braquial. Prohibido para júniors.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_chartrand_giant_swing_bwd_salto_half_turn_hang_bar_end', 'parallel_bars', 'III', 'C', null, 'III.69', 'Molino atrás con mortal atrás y media pirueta a la suspensión en el extremo de las barras', 'Chartrand', 'Acaba colgado en el extremo de las barras: tras el molino atrás, mortal atrás con media pirueta (180°). Suele salir del pino.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_matsunaga_giant_swing_bwd_salto_half_turn_upper_arm', 'parallel_bars', 'III', 'D', null, 'III.70', 'Molino atrás con mortal atrás y media pirueta al braquial', 'Matsunaga', 'Cae en apoyo braquial tras un mortal atrás con media pirueta (180°) al terminar el molino atrás; suele empezar en el pino. Vetado a júniors.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_solis_giant_swing_bwd_salto_half_turn_hang', 'parallel_bars', 'III', 'E', null, 'III.71', 'Molino atrás con mortal atrás y media pirueta a la suspensión', 'Solis', 'Acaba en suspensión: suele salir del pino, pasa colgado por debajo en el molino atrás y remata con un mortal atrás con media pirueta (180°) que lo devuelve a la suspensión.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_tanaka_giant_bwd_half_turn_salto_fwd_1_5_upper_arm', 'parallel_bars', 'III', 'G', null, 'III.72', 'Molino atrás con medio giro y mortal y medio adelante al braquial', 'Tanaka', 'Mortal y medio adelante hasta el apoyo braquial, precedido de un medio giro (180°) al final del molino atrás. Suele salir del pino. Prohibido para júniors.', 108, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip', 'parallel_bars', 'III', 'A', null, 'III.73', 'Kippe larga al apoyo', 'Kippe larga', 'Kippe larga que termina en apoyo, con los brazos extendidos; suele empezar colgado en suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_half_turn_support', 'parallel_bars', 'III', 'B', null, 'III.74', 'Kippe larga con medio giro al apoyo', 'Kippe larga con medio giro', 'Al subir con la Kippe larga gira medio (180°) y queda en apoyo. Suele partir de la suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_bwd_handstand', 'parallel_bars', 'III', 'C', null, 'III.75', 'Kippe larga y balanceo atrás al pino', 'Kippe larga al pino', 'Sube hasta el pino: después de la Kippe larga, ya en apoyo, balancea atrás hasta arriba. Suele empezar en suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_torres_giant_swing_bwd_salto_half_turn_support', 'parallel_bars', 'III', 'E', null, 'III.77', 'Molino atrás con mortal atrás y media pirueta al apoyo', 'Torres', 'De la familia del Matsunaga y el Solis, pero llega al apoyo: molino atrás y mortal atrás con media pirueta (180°). Suele salir del pino.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_esparza_giant_bwd_half_turn_salto_fwd_1_5_piked_upper_arm', 'parallel_bars', 'III', 'H', null, 'III.78', 'Molino atrás con medio giro y mortal y medio adelante carpado al braquial', 'Esparza', 'El Tanaka con el cuerpo carpado: tras el molino atrás, medio giro (180°) y mortal y medio adelante carpado hasta el apoyo braquial. Prohibido para júniors. Suele empezar en el pino.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_straddle_cut_bwd_handstand_one_or_two_rails', 'parallel_bars', 'III', 'B', null, 'III.80', 'Kippe larga con corte atrás al pino', 'Kippe larga y corte al pino', 'Corte atrás con piernas abiertas tras la Kippe larga y llegada al pino, en las dos barras o en una sola, con el mismo valor. Suele salir de la suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_okubo_glide_kip_straddle_cut_bwd_to_hang', 'parallel_bars', 'III', 'C', null, 'III.81', 'Kippe larga con corte atrás a la suspensión', 'Okubo', 'Vuelve abajo: tras la Kippe larga corta atrás con piernas abiertas y regresa a la suspensión, que suele ser también de donde sale.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_fokin_giant_swing_bwd_salto_half_turn_straight_upper_arm', 'parallel_bars', 'III', 'E', null, 'III.83', 'Molino atrás con mortal atrás extendido y media pirueta al braquial', 'Fokin', 'Mortal atrás extendido con media pirueta (180°) tras el molino atrás y caída en apoyo braquial. Suele salir del pino. Prohibido para júniors.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_one_rail_straddle_l_sit_handstand', 'parallel_bars', 'III', 'B', null, 'III.86', 'Kippe larga en una barra pasando por ángulo con piernas abiertas al pino', 'Kippe larga en una barra', 'Solo la Kippe larga se hace sobre una barra; después pasa por ángulo con piernas abiertas y sube al pino. Suele partir de la suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_piked_l_sit_handstand', 'parallel_bars', 'III', 'C', null, 'III.87', 'Kippe larga pasando por ángulo carpado al pino', 'Kippe larga y ángulo al pino', 'Paso por ángulo, en carpado, entre la Kippe larga y el pino. Suele empezar en suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_glide_kip_piked_l_sit_handstand_hop_three_quarter_turn', 'parallel_bars', 'III', 'D', null, 'III.88', 'Kippe larga por ángulo al pino, salto y giro de 270° o más', 'Kippe larga, pino y salto con giro', 'Ya en el pino tras la Kippe larga y el paso por ángulo carpado, salta con un giro de 270° o más y vuelve a quedar en el pino; suele partir de la suspensión.', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_li_donghua_glide_kip_v_sit_hop_half_turn_hang', 'parallel_bars', 'III', 'B', null, 'III.92', 'Kippe larga por ángulo piernas verticales y salto con medio giro a la otra barra', 'Li Donghua', 'Empieza colgado de una barra y acaba colgado de la otra: Kippe larga pasando por ángulo piernas verticales, suelta y medio giro (180°).', 109, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_cast_to_upper_arm', 'parallel_bars', 'III', 'A', null, 'III.97', 'Balanceo por debajo de las barras al braquial', 'Balanceo por debajo al braquial', 'Desde el apoyo, como suele hacerse, pasa por debajo de las barras y acaba en apoyo braquial.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_cast_to_support', 'parallel_bars', 'III', 'B', null, 'III.98', 'Balanceo por debajo de las barras al apoyo', 'Balanceo por debajo al apoyo', 'Llega otra vez al apoyo, con brazos extendidos, tras un balanceo por debajo de las barras; suele empezar también en apoyo.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_half_turn_upper_arm', 'parallel_bars', 'III', 'C', null, 'III.99', 'Felga con medio giro al braquial', 'Felga con medio giro al braquial', 'Medio giro (180°) al final de la felga para caer en apoyo braquial.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_half_turn_rear_support', 'parallel_bars', 'III', 'D', null, 'III.100', 'Felga con medio giro al apoyo dorsal', 'Felga con medio giro al apoyo dorsal', 'La felga termina de espaldas: medio giro (180°) y llegada al apoyo dorsal.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_cast_half_turn_upper_arm', 'parallel_bars', 'III', 'B', null, 'III.104', 'Balanceo por debajo de las barras con medio giro al braquial', 'Medio giro por debajo al braquial', 'Cae en apoyo braquial tras girar medio (180°) en un balanceo por debajo de las barras. Suele partir del apoyo.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_cast_half_turn_support', 'parallel_bars', 'III', 'C', null, 'III.105', 'Balanceo por debajo de las barras con medio giro al apoyo', 'Medio giro por debajo al apoyo', 'Medio giro (180°) en un balanceo por debajo de las barras, con llegada al apoyo; suele empezar también en apoyo.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_cucherat_celen_felge_handstand', 'parallel_bars', 'III', 'D', null, 'III.106', 'Felga al pino', 'Cucherat-Celen', 'Felga hasta el pino que suele empezar en el pino, en apoyo o de pie. Vale igual con cuarto de giro (90°) o acabando en una barra si no va unida a un Healy. Una felga con medio giro que necesite dos o más apoyos de manos se valora aquí.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_half_or_three_quarter_turn_handstand', 'parallel_bars', 'III', 'E', null, 'III.107', 'Felga con medio giro o tres cuartos de giro al pino', 'Felga con giro al pino', 'Medio giro (180°) o tres cuartos (270°) durante la felga hasta el pino. Con medio giro solo se permite un apoyo de manos antes del pino; con dos o más se valora como la III.106 (Cucherat-Celen). Suele partir del pino, del apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_teng_hai_bin_felge_full_turn_handstand', 'parallel_bars', 'III', 'F', null, 'III.108', 'Felga con giro completo al pino', 'Teng Hai Bin', 'Giro completo (360°) dentro de la felga para llegar al pino. Suele empezar en el pino, en apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_arican_cast_straddle_cut_bwd_handstand', 'parallel_bars', 'III', 'C', null, 'III.111', 'Balanceo por debajo con corte atrás al pino', 'Arican', 'Llega al pino tras un balanceo por debajo de las barras y un corte atrás con piernas abiertas; suele empezar en apoyo. Hecho en una barra no vale más.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_zhou_shixiong_felge_five_quarter_turn_handstand', 'parallel_bars', 'III', 'G', null, 'III.114', 'Felga con giro (450°) al pino', 'Zhou Shixiong', 'Vuelta y cuarto de giro (450°) durante la felga antes de llegar al pino. Suele salir del pino, del apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_travel_to_hang', 'parallel_bars', 'III', 'A', null, 'III.115', 'Felga con desplazamiento a la suspensión', 'Felga a la suspensión', 'Felga que avanza a lo largo de las barras y termina en suspensión. Suele empezar en apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_to_support', 'parallel_bars', 'III', 'B', null, 'III.116', 'Felga al apoyo', 'Felga al apoyo', 'Felga sencilla que acaba en apoyo, con los brazos extendidos. Suele partir del apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_immediate_straddle_cut_support', 'parallel_bars', 'III', 'C', null, 'III.117', 'Felga con corte inmediato de piernas abiertas al apoyo', 'Felga y corte al apoyo', 'El corte con piernas abiertas llega justo al acabar la felga, sin pausa, y termina en apoyo. Suele empezar en apoyo o de pie.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_chiarlo_felge_one_rail_handstand_healy', 'parallel_bars', 'III', 'E', null, 'III.119', 'Felga al pino en una barra enlazada con Healy', 'Chiarlo', 'Felga hasta el pino sobre una sola barra, que solo vale así si va enlazada con un elemento tipo Healy. Suele empezar en el pino.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_yamamuro_felge_through_handstand_makuts', 'parallel_bars', 'III', 'G', null, 'III.120', 'Felga pasando por el pino y Makuts', 'Yamamuro', 'Encadena dos piezas grandes: una felga que pasa por el pino y un Makuts; suele salir del pino y terminar en apoyo.', 110, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_gagnon_felge_roll_bwd_tuck_half_salto_upper_arm', 'parallel_bars', 'III', 'B', null, 'III.122', 'Felga en voltereta atrás con medio mortal agrupado al braquial', 'Gagnon', 'Medio mortal agrupado al final de una felga en voltereta atrás, con llegada al apoyo braquial. Prohibido para júniors.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_gagnon_2_felge_roll_bwd_straight_half_salto_upper_arm', 'parallel_bars', 'III', 'C', null, 'III.123', 'Felga en voltereta atrás con medio mortal extendido al braquial', 'Gagnon 2', 'Forma extendida del Gagnon: la felga en voltereta atrás y el medio mortal se hacen con el cuerpo recto hasta caer en apoyo braquial. Prohibido para júniors.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_tejada_felge_salto_bwd_tuck_upper_arm', 'parallel_bars', 'III', 'E', null, 'III.125', 'Felga y mortal atrás agrupado al braquial', 'Tejada', 'Mortal atrás agrupado enlazado con la felga y llegada al apoyo braquial. Prohibido para júniors.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_juarez_1_felge_salto_bwd_piked_upper_arm', 'parallel_bars', 'III', 'F', null, 'III.126', 'Felga y mortal atrás carpado al braquial', 'Juarez 1', 'Es el Tejada carpado: después de la felga, mortal atrás con el cuerpo carpado hasta el apoyo braquial. No se permite a júniors.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_fwd_to_support', 'parallel_bars', 'III', 'A', null, 'III.127', 'Felga adelante al apoyo', 'Felga adelante al apoyo', 'Felga hacia adelante que suele empezar en apoyo y vuelve a terminar en apoyo.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_felge_fwd_half_turn_support', 'parallel_bars', 'III', 'B', null, 'III.128', 'Felga adelante con medio giro al apoyo', 'Felga adelante con medio giro', 'Añade un medio giro (180°) a la felga adelante y acaba en apoyo; suele empezar también en apoyo.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_shoot_up_quarter_turn_handstand', 'parallel_bars', 'III', 'D', null, 'III.130', 'Subida de impulso con cuarto de giro al pino', 'Subida de impulso con cuarto de giro', 'Suele empezar de pie, pasar a la suspensión y desde ahí subir de impulso hasta el pino con un cuarto de giro (90°).', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_nguyen_shoot_up_half_or_three_quarter_turn_handstand', 'parallel_bars', 'III', 'E', null, 'III.131', 'Subida de impulso con giro al pino', 'Nguyen', 'Desde la suspensión, subida de impulso con medio giro (180°) o tres cuartos de giro (270°) hasta el pino; las dos formas valen lo mismo.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date),
  ('mpb_hg_malone_shoot_up_handstand_fall_back_quarter_turn_support', 'parallel_bars', 'III', 'E', null, 'III.137', 'Subida de impulso al pino, caída atrás y cuarto de giro al apoyo', 'Malone', 'Sube de impulso al pino, se deja caer atrás y con un cuarto de giro (90°) acaba en apoyo. Suele partir de la suspensión.', 111, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 12, 'reviewed', '2026-11-23'::date);

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
